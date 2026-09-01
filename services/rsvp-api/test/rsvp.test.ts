import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asc } from "drizzle-orm";
import { rsvps } from "../src/db/schema.js";
import { createTestApp, postRsvp, validSubmission, TEST_ORIGIN, type TestContext } from "./helpers.js";

describe("RSVP API", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const allRows = () => ctx.app.db.select().from(rsvps).orderBy(asc(rsvps.id)).all();

  /* ---------------------------------------------------------------- health */

  it("reports healthy and confirms the database answers", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: { status: "ok", database: "ok" },
    });
  });

  /* ---------------------------------------------------------------- config */

  it("publishes the authoritative guest limit and nothing private", async () => {
    await postRsvp(ctx.app, validSubmission());

    const response = await ctx.app.inject({ method: "GET", url: "/v1/rsvp/config" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toEqual({ ok: true, data: { maxGuests: 10 } });

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("Ayşe");
  });

  /* ------------------------------------------------------------ attendance */

  it("records a guest who is attending", async () => {
    const response = await postRsvp(ctx.app, validSubmission({ guestCount: 3 }));

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      ok: true,
      data: { status: "created", attendance: "yes", guestCount: 3 },
    });

    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fullName: "Ayşe Yılmaz", attendance: "yes", guestCount: 3 });
  });

  it("records a guest who cannot attend and forces the guest count to zero", async () => {
    const response = await postRsvp(
      ctx.app,
      // A stale count from the form must not survive the "not attending" choice.
      validSubmission({ attendance: "no", guestCount: 4 }),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toEqual({ status: "created", attendance: "no", guestCount: 0 });
    expect(allRows()[0]).toMatchObject({ attendance: "no", guestCount: 0 });
  });

  /* ------------------------------------------------------------ validation */

  it("rejects a guest count above the authoritative maximum", async () => {
    const response = await postRsvp(ctx.app, validSubmission({ guestCount: 11 }));
    const body = response.json();

    expect(response.statusCode).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fields.guestCount).toContain("10");
    expect(allRows()).toHaveLength(0);
  });

  it("rejects zero guests when attending", async () => {
    const response = await postRsvp(ctx.app, validSubmission({ guestCount: 0 }));

    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toHaveProperty("guestCount");
    expect(allRows()).toHaveLength(0);
  });

  it("rejects a submission that is missing required fields", async () => {
    const response = await postRsvp(ctx.app, { submissionToken: "token-aaaaaaaaaaaaaaaaaaaa" });
    const body = response.json();

    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(body.error.fields)).toEqual(expect.arrayContaining(["fullName", "attendance"]));
    expect(allRows()).toHaveLength(0);
  });

  it("rejects a name that is only whitespace", async () => {
    const response = await postRsvp(ctx.app, validSubmission({ fullName: "   " }));

    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toHaveProperty("fullName");
    expect(allRows()).toHaveLength(0);
  });

  it("rejects an unusable submission token", async () => {
    const response = await postRsvp(ctx.app, validSubmission({ submissionToken: "short" }));

    expect(response.statusCode).toBe(400);
    expect(allRows()).toHaveLength(0);
  });

  it("rejects a note longer than the limit", async () => {
    const response = await postRsvp(ctx.app, validSubmission({ note: "a".repeat(501) }));

    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toHaveProperty("note");
  });

  /* -------------------------------------------------------------- honeypot */

  it("silently discards a submission with the honeypot filled in", async () => {
    const response = await postRsvp(ctx.app, validSubmission({ website: "https://spam.example" }));

    // The bot gets an ordinary-looking success and learns nothing.
    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    expect(allRows()).toHaveLength(0);
  });

  /* ----------------------------------------------- duplicate prevention */

  it("updates the existing response when the same browser submits again", async () => {
    const token = "token-repeat-visitor-000000";

    const first = await postRsvp(ctx.app, validSubmission({ submissionToken: token, guestCount: 2 }));
    expect(first.statusCode).toBe(201);
    expect(first.json().data.status).toBe("created");

    const firstRow = allRows()[0];
    expect(firstRow).toBeDefined();

    const second = await postRsvp(
      ctx.app,
      validSubmission({
        submissionToken: token,
        fullName: "Ayşe Yılmaz Demir",
        guestCount: 4,
        note: "Vejetaryen menü olabilir mi?",
      }),
    );

    expect(second.statusCode).toBe(200);
    expect(second.json().data).toEqual({ status: "updated", attendance: "yes", guestCount: 4 });

    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: firstRow!.id,
      fullName: "Ayşe Yılmaz Demir",
      guestCount: 4,
      note: "Vejetaryen menü olabilir mi?",
      createdAt: firstRow!.createdAt,
    });
    expect(rows[0]!.updatedAt >= firstRow!.updatedAt).toBe(true);
  });

  it("keeps different browsers apart", async () => {
    await postRsvp(ctx.app, validSubmission({ submissionToken: "token-browser-one-00000000" }));
    await postRsvp(
      ctx.app,
      validSubmission({ submissionToken: "token-browser-two-00000000", fullName: "Mehmet Öztürk" }),
    );

    const rows = allRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.fullName)).toEqual(["Ayşe Yılmaz", "Mehmet Öztürk"]);
  });

  /* ----------------------------------------------------- Turkish handling */

  it("stores Turkish characters exactly as typed", async () => {
    const fullName = "Şeyma Çağlayan İpekgül";
    const note = "Uğur'un ağabeyi ile geleceğiz; nikâhta olacağız.";

    const response = await postRsvp(ctx.app, validSubmission({ fullName, note }));
    expect(response.statusCode).toBe(201);

    expect(allRows()[0]).toMatchObject({ fullName, note });
  });

  it("collapses stray whitespace without altering Turkish letters", async () => {
    const response = await postRsvp(
      ctx.app,
      validSubmission({ fullName: "  Gülşah   \t Öz  ", note: "  iki   boşluk  " }),
    );

    expect(response.statusCode).toBe(201);
    expect(allRows()[0]).toMatchObject({ fullName: "Gülşah Öz", note: "iki boşluk" });
  });

  /* ------------------------------------------------------------- payloads */

  it("rejects a body that is not JSON", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/v1/rsvp",
      headers: { "content-type": "text/plain" },
      payload: "fullName=Ayse",
    });

    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects an oversized body without leaking internals", async () => {
    const response = await postRsvp(ctx.app, validSubmission({ note: "x".repeat(64 * 1024) }));

    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("answers unknown endpoints with a plain 404", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/v1/rsvp/list" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  /* ----------------------------------------------------------------- cors */

  it("grants CORS to an allowlisted origin", async () => {
    const response = await ctx.app.inject({
      method: "OPTIONS",
      url: "/v1/rsvp",
      headers: {
        origin: TEST_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.statusCode).toBeLessThan(300);
    expect(response.headers["access-control-allow-origin"]).toBe(TEST_ORIGIN);
  });

  it("withholds CORS from an origin that is not allowlisted", async () => {
    const response = await ctx.app.inject({
      method: "OPTIONS",
      url: "/v1/rsvp",
      headers: {
        origin: "https://not-our-site.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
