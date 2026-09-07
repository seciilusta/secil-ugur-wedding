import { describe, expect, it } from "vitest";
import { getAdminToken, getDatabaseUrl, getMaxGuests, getRateLimitSecret } from "@/server/config";
import {
  createConfigHandler,
  createExportHandler,
  createHealthHandler,
  createSubmitHandler,
  hashClientAddress,
} from "@/server/rsvp/handlers";
import type {
  RateLimitInput,
  RsvpRepository,
  StoredRsvp,
  UpsertRsvpInput,
} from "@/server/rsvp/repository";

const ADMIN_TOKEN = "test-admin-token-0123456789abcdef";
const RATE_SECRET = "test-rate-limit-secret-0123456789abcdef";
const FIXED_DATE = new Date("2026-09-07T12:00:00.000Z");

class MemoryRepository implements RsvpRepository {
  readonly rows = new Map<string, StoredRsvp>();
  readonly counters = new Map<string, number>();
  pingError: Error | null = null;

  async ping(): Promise<void> {
    if (this.pingError) throw this.pingError;
  }

  async consumeRateLimit(input: RateLimitInput): Promise<number> {
    const key = `${input.fingerprint}:${input.windowStart.toISOString()}`;
    const count = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, count);
    return count;
  }

  async upsertRsvp(input: UpsertRsvpInput): Promise<{ status: "created" | "updated" }> {
    const existing = this.rows.get(input.submissionToken);
    this.rows.set(input.submissionToken, {
      id: existing?.id ?? this.rows.size + 1,
      submissionToken: input.submissionToken,
      fullName: input.fullName,
      attendance: input.attendance,
      guestCount: input.guestCount,
      note: input.note,
      revision: (existing?.revision ?? 0) + 1,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
    });
    return { status: existing ? "updated" : "created" };
  }

  async listRsvps(): Promise<StoredRsvp[]> {
    return [...this.rows.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
  }
}

function validSubmission(overrides: Record<string, unknown> = {}) {
  return {
    submissionToken: "token-aaaaaaaaaaaaaaaaaaaa",
    fullName: "Ayşe Yılmaz",
    attendance: "yes",
    guestCount: 2,
    note: "",
    website: "",
    ...overrides,
  };
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://wedding.example/v1/rsvp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function submitHandler(repository: RsvpRepository) {
  return createSubmitHandler({
    repository,
    maxGuests: 10,
    rateLimitSecret: RATE_SECRET,
    now: () => FIXED_DATE,
  });
}

describe("serverless RSVP API", () => {
  it("reports database health and the public guest limit", async () => {
    const repository = new MemoryRepository();
    const health = await createHealthHandler(repository, () => FIXED_DATE)();
    const config = await createConfigHandler(10)();

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      ok: true,
      data: { status: "ok", database: "ok", timestamp: FIXED_DATE.toISOString() },
    });
    expect(await config.json()).toEqual({ ok: true, data: { maxGuests: 10 } });
  });

  it("returns 503 when Postgres cannot answer", async () => {
    const repository = new MemoryRepository();
    repository.pingError = new Error("offline");
    const response = await createHealthHandler(repository)();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("creates then updates one response for the same browser token", async () => {
    const repository = new MemoryRepository();
    const submit = submitHandler(repository);

    const created = await submit(request(validSubmission({ fullName: "  Şeyma   Çağlayan ", guestCount: 3 })));
    const updated = await submit(
      request(validSubmission({ attendance: "no", guestCount: 8, note: "  Çok   teşekkürler  " })),
    );

    expect(created.status).toBe(201);
    expect((await created.json()).data.status).toBe("created");
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({
      ok: true,
      data: { status: "updated", attendance: "no", guestCount: 0 },
    });
    expect(repository.rows.size).toBe(1);
    expect(repository.rows.values().next().value).toMatchObject({
      fullName: "Ayşe Yılmaz",
      guestCount: 0,
      note: "Çok teşekkürler",
      revision: 2,
    });
  });

  it("rejects invalid fields, malformed JSON, unsupported media and oversized bodies", async () => {
    const repository = new MemoryRepository();
    const submit = submitHandler(repository);

    const invalid = await submit(request(validSubmission({ guestCount: 11 })));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.fields.guestCount).toContain("10");

    const malformed = await submit(request("{"));
    expect(malformed.status).toBe(400);

    const unsupported = await submit(request("name=Ayse", { "content-type": "text/plain" }));
    expect(unsupported.status).toBe(415);

    const oversized = await submit(request(validSubmission(), { "content-length": String(17 * 1024) }));
    expect(oversized.status).toBe(413);
    expect(repository.rows.size).toBe(0);
  });

  it("rejects missing fields, short tokens, zero attending guests and long notes", async () => {
    const repository = new MemoryRepository();
    const submit = submitHandler(repository);

    const missing = await submit(request({ submissionToken: "token-aaaaaaaaaaaaaaaaaaaa" }));
    expect((await missing.json()).error.fields).toMatchObject({
      fullName: expect.any(String),
      attendance: expect.any(String),
    });

    expect((await (await submit(request(validSubmission({ submissionToken: "short" })))).json()).error.fields)
      .toHaveProperty("submissionToken");
    expect((await (await submit(request(validSubmission({ guestCount: 0 })))).json()).error.fields)
      .toHaveProperty("guestCount");
    expect((await (await submit(request(validSubmission({ note: "a".repeat(501) })))).json()).error.fields)
      .toHaveProperty("note");
    expect(repository.rows.size).toBe(0);
  });

  it("keeps different browser tokens separate and preserves Turkish text", async () => {
    const repository = new MemoryRepository();
    const submit = submitHandler(repository);
    await submit(
      request(
        validSubmission({
          submissionToken: "token-browser-one-00000000",
          fullName: "Şeyma Çağlayan İpekgül",
          note: "Birinci satır\n\n\n  İkinci   satır ",
        }),
      ),
    );
    await submit(
      request(validSubmission({ submissionToken: "token-browser-two-00000000", fullName: "Mehmet Öztürk" })),
    );

    expect(repository.rows.size).toBe(2);
    expect(repository.rows.get("token-browser-one-00000000")).toMatchObject({
      fullName: "Şeyma Çağlayan İpekgül",
      note: "Birinci satır\n\nİkinci satır",
    });
  });

  it("silently discards honeypot submissions", async () => {
    const repository = new MemoryRepository();
    const response = await submitHandler(repository)(request(validSubmission({ website: "https://spam.example" })));
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(repository.rows.size).toBe(0);
  });

  it("limits the thirteenth request in one ten-minute address window", async () => {
    const repository = new MemoryRepository();
    const submit = submitHandler(repository);
    for (let index = 0; index < 12; index += 1) {
      const response = await submit(request(validSubmission()));
      expect(response.status).toBe(index === 0 ? 201 : 200);
    }
    const limited = await submit(request(validSubmission()));
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe("RATE_LIMITED");
    expect(limited.headers.get("retry-after")).toBe("600");
  });

  it("hashes addresses with a keyed, non-reversible fingerprint", () => {
    const first = hashClientAddress("203.0.113.8", RATE_SECRET);
    const second = hashClientAddress("203.0.113.8", `${RATE_SECRET}-different`);
    expect(first).toHaveLength(64);
    expect(first).not.toContain("203.0.113.8");
    expect(first).not.toBe(second);
  });

  it("protects and safely formats the CSV export", async () => {
    const repository = new MemoryRepository();
    await repository.upsertRsvp({
      ...validSubmission({ note: '=HYPERLINK("bad")' }),
      attendance: "yes",
      guestCount: 2,
      now: FIXED_DATE,
    });
    const getExport = createExportHandler({ repository, adminToken: ADMIN_TOKEN });

    const unauthorized = await getExport(new Request("https://wedding.example/v1/rsvp/export.csv"));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toBe('Bearer realm="rsvp-export"');
    expect(await unauthorized.text()).not.toContain("Ayşe");

    const authorized = await getExport(
      new Request("https://wedding.example/v1/rsvp/export.csv", {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      }),
    );
    const bytes = new Uint8Array(await authorized.clone().arrayBuffer());
    const csv = await authorized.text();
    expect(authorized.status).toBe(200);
    expect(authorized.headers.get("content-type")).toContain("text/csv");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv).toContain("Ayşe Yılmaz");
    expect(csv).toContain(`"'=HYPERLINK(""bad"")"`);
  });

  it("does not accept an export token from the URL and emits only headers for an empty database", async () => {
    const repository = new MemoryRepository();
    const getExport = createExportHandler({ repository, adminToken: ADMIN_TOKEN });
    const queryToken = await getExport(
      new Request(`https://wedding.example/v1/rsvp/export.csv?token=${ADMIN_TOKEN}`),
    );
    expect(queryToken.status).toBe(401);

    const empty = await getExport(
      new Request("https://wedding.example/v1/rsvp/export.csv", {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      }),
    );
    const csv = await empty.text();
    expect(csv.trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("sorts CSV responses oldest first and labels non-attendance", async () => {
    const repository = new MemoryRepository();
    await repository.upsertRsvp({
      submissionToken: "token-later-00000000000000",
      fullName: "Zeynep Kaya",
      attendance: "yes",
      guestCount: 2,
      note: "",
      now: new Date("2026-09-07T13:00:00.000Z"),
    });
    await repository.upsertRsvp({
      submissionToken: "token-earlier-000000000000",
      fullName: "Ali Veli",
      attendance: "no",
      guestCount: 0,
      note: "",
      now: new Date("2026-09-07T11:00:00.000Z"),
    });
    const response = await createExportHandler({ repository, adminToken: ADMIN_TOKEN })(
      new Request("https://wedding.example/v1/rsvp/export.csv", {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      }),
    );
    const csv = await response.text();
    expect(csv.indexOf("Ali Veli")).toBeLessThan(csv.indexOf("Zeynep Kaya"));
    expect(csv).toContain('"Katılamayacak","0"');
  });
});

describe("server environment", () => {
  it("validates secrets and the Neon connection URL", () => {
    const environment = {
      DATABASE_URL: "postgresql://user:password@host/database?sslmode=require",
      RSVP_ADMIN_TOKEN: ADMIN_TOKEN,
      RATE_LIMIT_SECRET: RATE_SECRET,
      RSVP_MAX_GUESTS: "12",
    };
    expect(getDatabaseUrl(environment)).toContain("postgresql://");
    expect(getAdminToken(environment)).toBe(ADMIN_TOKEN);
    expect(getRateLimitSecret(environment)).toBe(RATE_SECRET);
    expect(getMaxGuests(environment)).toBe(12);
  });

  it("uses ten guests by default and rejects missing production secrets", () => {
    expect(getMaxGuests({})).toBe(10);
    expect(() => getDatabaseUrl({})).toThrow(/DATABASE_URL/u);
    expect(() => getAdminToken({})).toThrow(/RSVP_ADMIN_TOKEN/u);
    expect(() => getRateLimitSecret({})).toThrow(/RATE_LIMIT_SECRET/u);
  });
});
