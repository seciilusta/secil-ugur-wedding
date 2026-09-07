import { createHmac, timingSafeEqual } from "node:crypto";
import { buildCsv } from "@/server/rsvp/csv";
import { buildRsvpBodySchema } from "@/server/rsvp/schema";
import type { RsvpRepository } from "@/server/rsvp/repository";

const BODY_LIMIT_BYTES = 16 * 1024;
const RATE_LIMIT_MAX = 12;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const CSV_HEADERS = [
  "Sıra",
  "Ad Soyad",
  "Katılım",
  "Kişi Sayısı",
  "Not",
  "İlk Gönderim",
  "Son Güncelleme",
] as const;

type Clock = () => Date;

export interface SubmitHandlerDependencies {
  repository: RsvpRepository;
  maxGuests: number;
  rateLimitSecret: string;
  now?: Clock;
}

function jsonError(status: number, code: string, message: string, fields?: Record<string, string>): Response {
  return Response.json(
    { ok: false, error: { code, message, ...(fields ? { fields } : {}) } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function readClientAddress(request: Request): string {
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export function hashClientAddress(address: string, secret: string): string {
  return createHmac("sha256", secret).update(`rsvp-submit:${address}`).digest("hex");
}

function readBearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  const match = value ? /^Bearer (.+)$/u.exec(value.trim()) : null;
  return match?.[1]?.trim() ?? null;
}

export function secretsMatch(provided: string, expected: string): boolean {
  const first = Buffer.from(provided, "utf8");
  const second = Buffer.from(expected, "utf8");
  return first.length === second.length && timingSafeEqual(first, second);
}

async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    return { ok: false, response: jsonError(415, "UNSUPPORTED_MEDIA_TYPE", "Send application/json.") };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT_BYTES) {
    return { ok: false, response: jsonError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.") };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: jsonError(400, "BAD_REQUEST", "Request could not be read.") };
  }

  if (new TextEncoder().encode(text).byteLength > BODY_LIMIT_BYTES) {
    return { ok: false, response: jsonError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.") };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: jsonError(400, "BAD_REQUEST", "Request could not be read.") };
  }
}

export function createConfigHandler(maxGuests: number) {
  return async function GET(): Promise<Response> {
    return Response.json(
      { ok: true, data: { maxGuests } },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
    );
  };
}

export function createHealthHandler(repository: RsvpRepository, now: Clock = () => new Date()) {
  return async function GET(): Promise<Response> {
    try {
      await repository.ping();
      return Response.json(
        { ok: true, data: { status: "ok", database: "ok", timestamp: now().toISOString() } },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      console.error("RSVP health check could not reach the database", error);
      return jsonError(503, "DATABASE_UNAVAILABLE", "Database is not reachable.");
    }
  };
}

export function createSubmitHandler(dependencies: SubmitHandlerDependencies) {
  const now = dependencies.now ?? (() => new Date());

  return async function POST(request: Request): Promise<Response> {
    const requestTime = now();
    const bucket = Math.floor(requestTime.getTime() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;

    try {
      const count = await dependencies.repository.consumeRateLimit({
        fingerprint: hashClientAddress(readClientAddress(request), dependencies.rateLimitSecret),
        windowStart: new Date(bucket),
        expiresAt: new Date(bucket + RATE_LIMIT_WINDOW_MS),
        now: requestTime,
      });
      if (count > RATE_LIMIT_MAX) {
        const response = jsonError(429, "RATE_LIMITED", "Too many requests. Please try again shortly.");
        response.headers.set("Retry-After", String(RATE_LIMIT_WINDOW_MS / 1000));
        return response;
      }
    } catch (error) {
      console.error("RSVP rate-limit check failed", error);
      return jsonError(500, "INTERNAL_ERROR", "Could not save the response.");
    }

    const bodyResult = await readJsonBody(request);
    if (!bodyResult.ok) return bodyResult.response;

    const parsed = buildRsvpBodySchema(dependencies.maxGuests).safeParse(bodyResult.value);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join(".") || "body";
        fields[field] ??= issue.message;
      }
      return jsonError(400, "VALIDATION_ERROR", "Request body failed validation.", fields);
    }

    const body = parsed.data;
    const guestCount = body.attendance === "yes" ? body.guestCount : 0;

    if (body.website.trim().length > 0) {
      return Response.json({
        ok: true,
        data: { status: "created", attendance: body.attendance, guestCount },
      });
    }

    try {
      const { status } = await dependencies.repository.upsertRsvp({
        submissionToken: body.submissionToken,
        fullName: body.fullName,
        attendance: body.attendance,
        guestCount,
        note: body.note,
        now: requestTime,
      });
      return Response.json(
        { ok: true, data: { status, attendance: body.attendance, guestCount } },
        { status: status === "created" ? 201 : 200 },
      );
    } catch (error) {
      console.error("Failed to persist RSVP", error);
      return jsonError(500, "INTERNAL_ERROR", "Could not save the response.");
    }
  };
}

export function createExportHandler(dependencies: { repository: RsvpRepository; adminToken: string }) {
  return async function GET(request: Request): Promise<Response> {
    const provided = readBearerToken(request);
    if (!provided || !secretsMatch(provided, dependencies.adminToken)) {
      const response = jsonError(401, "UNAUTHORIZED", "A valid admin bearer token is required.");
      response.headers.set("WWW-Authenticate", 'Bearer realm="rsvp-export"');
      return response;
    }

    try {
      const rows = await dependencies.repository.listRsvps();
      const csv = buildCsv(
        [...CSV_HEADERS],
        rows.map((row, index) => [
          index + 1,
          row.fullName,
          row.attendance === "yes" ? "Katılacak" : "Katılamayacak",
          row.guestCount,
          row.note,
          row.createdAt.toISOString(),
          row.updatedAt.toISOString(),
        ]),
      );
      const stamp = new Date().toISOString().slice(0, 10);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="rsvp-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("Failed to export RSVPs", error);
      return jsonError(500, "INTERNAL_ERROR", "Could not export responses.");
    }
  };
}
