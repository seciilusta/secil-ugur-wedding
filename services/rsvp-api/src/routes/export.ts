import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import { asc } from "drizzle-orm";
import { rsvps } from "../db/schema.js";
import { buildCsv } from "../utils/csv.js";

/** Column headings, written for someone opening the file in Turkish Excel. */
const CSV_HEADERS = [
  "Sıra",
  "Ad Soyad",
  "Katılım",
  "Kişi Sayısı",
  "Not",
  "İlk Gönderim",
  "Son Güncelleme",
] as const;

/** Compares two secrets without leaking their length or contents through timing. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string") return null;

  const match = /^Bearer (.+)$/u.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

/**
 * `GET /v1/rsvp/export.csv`
 *
 * The only endpoint that returns other people's answers, so it is the only one
 * behind the admin token. The token is read from the `Authorization` header and
 * from nowhere else — never from a query string, where it would end up in server
 * logs, browser history and referrer headers.
 */
export const exportRoutes: FastifyPluginCallback = (app, _options, done) => {
  app.get(
    "/v1/rsvp/export.csv",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const token = readBearerToken(request);

      if (!token || !secretsMatch(token, app.appConfig.adminToken)) {
        request.log.warn({ ip: request.ip }, "Rejected an unauthorised CSV export attempt");
        // No rows, no hint about whether the token merely had the wrong value.
        return reply
          .code(401)
          .header("WWW-Authenticate", 'Bearer realm="rsvp-export"')
          .send({
            ok: false,
            error: { code: "UNAUTHORIZED", message: "A valid admin bearer token is required." },
          });
      }

      // Predictable order: oldest response first, id breaking any tie.
      const rows = app.db
        .select()
        .from(rsvps)
        .orderBy(asc(rsvps.createdAt), asc(rsvps.id))
        .all();

      const csv = buildCsv(
        [...CSV_HEADERS],
        rows.map((row, index) => [
          index + 1,
          row.fullName,
          row.attendance === "yes" ? "Katılacak" : "Katılamayacak",
          row.guestCount,
          row.note,
          row.createdAt,
          row.updatedAt,
        ]),
      );

      const stamp = new Date().toISOString().slice(0, 10);

      return reply
        .code(200)
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="rsvp-${stamp}.csv"`)
        .header("Cache-Control", "no-store")
        .send(csv);
    },
  );

  done();
};
