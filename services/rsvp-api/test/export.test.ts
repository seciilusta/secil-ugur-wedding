import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestApp,
  getCsv,
  postRsvp,
  validSubmission,
  TEST_ADMIN_TOKEN,
  type TestContext,
} from "./helpers.js";

describe("CSV export", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  /* -------------------------------------------------------- authorization */

  it("refuses a request with no Authorization header and returns no data", async () => {
    await postRsvp(ctx.app, validSubmission());

    const response = await getCsv(ctx.app);

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
    expect(response.body).not.toContain("Ayşe");
  });

  it("refuses a wrong token", async () => {
    await postRsvp(ctx.app, validSubmission());

    const response = await getCsv(ctx.app, "not-the-admin-token-0123456789ab");

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain("Ayşe");
  });

  it("refuses a token of the right value passed in the query string", async () => {
    await postRsvp(ctx.app, validSubmission());

    // The token must only ever travel in the Authorization header.
    const response = await ctx.app.inject({
      method: "GET",
      url: `/v1/rsvp/export.csv?token=${TEST_ADMIN_TOKEN}`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain("Ayşe");
  });

  /* ------------------------------------------------------------- contents */

  it("returns a UTF-8 CSV with a BOM and Turkish headings", async () => {
    await postRsvp(ctx.app, validSubmission({ fullName: "Ayşe Yılmaz", guestCount: 2 }));

    const response = await getCsv(ctx.app, TEST_ADMIN_TOKEN);

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-type"]).toContain("charset=utf-8");
    expect(response.headers["content-disposition"]).toContain("attachment");

    const body = response.body;
    expect(body.startsWith("\uFEFF")).toBe(true);

    const [header, firstRow] = body.replace(/^\uFEFF/u, "").split("\r\n");
    expect(header).toBe('"Sıra","Ad Soyad","Katılım","Kişi Sayısı","Not","İlk Gönderim","Son Güncelleme"');
    expect(firstRow).toContain('"Ayşe Yılmaz"');
    expect(firstRow).toContain('"Katılacak"');
    expect(firstRow).toContain('"2"');
  });

  it("labels a guest who cannot attend", async () => {
    await postRsvp(ctx.app, validSubmission({ attendance: "no", guestCount: 3 }));

    const response = await getCsv(ctx.app, TEST_ADMIN_TOKEN);

    expect(response.body).toContain('"Katılamayacak"');
    expect(response.body).toContain('"0"');
  });

  it("returns only the header row when nothing has been submitted", async () => {
    const response = await getCsv(ctx.app, TEST_ADMIN_TOKEN);
    const lines = response.body.replace(/^\uFEFF/u, "").trimEnd().split("\r\n");

    expect(response.statusCode).toBe(200);
    expect(lines).toHaveLength(1);
  });

  it("sorts responses oldest first", async () => {
    await postRsvp(ctx.app, validSubmission({ submissionToken: "token-first-guest-00000000", fullName: "Ali Veli" }));
    await postRsvp(
      ctx.app,
      validSubmission({ submissionToken: "token-second-guest-0000000", fullName: "Zeynep Kaya" }),
    );

    const response = await getCsv(ctx.app, TEST_ADMIN_TOKEN);
    const rows = response.body.replace(/^\uFEFF/u, "").trimEnd().split("\r\n").slice(1);

    expect(rows[0]).toContain("Ali Veli");
    expect(rows[1]).toContain("Zeynep Kaya");
    expect(rows[0]).toContain('"1"');
    expect(rows[1]).toContain('"2"');
  });

  /* -------------------------------------------------------------- escaping */

  it("escapes quotes, commas and semicolons inside a note", async () => {
    await postRsvp(
      ctx.app,
      validSubmission({ note: 'Ali "abi" gelecek, Ayşe gelmeyecek; teşekkürler' }),
    );

    const response = await getCsv(ctx.app, TEST_ADMIN_TOKEN);
    const rows = response.body.replace(/^\uFEFF/u, "").trimEnd().split("\r\n");

    // Doubled inner quotes, and the row is not split by the comma or semicolon.
    expect(response.body).toContain('"Ali ""abi"" gelecek, Ayşe gelmeyecek; teşekkürler"');
    expect(rows).toHaveLength(2);
  });

  it("neutralises a note that a spreadsheet would treat as a formula", async () => {
    await postRsvp(ctx.app, validSubmission({ note: "=1+1" }));

    const response = await getCsv(ctx.app, TEST_ADMIN_TOKEN);

    expect(response.body).toContain(`"'=1+1"`);
  });

  it("keeps a multi-line note inside a single quoted field", async () => {
    await postRsvp(ctx.app, validSubmission({ note: "Birinci satır\nİkinci satır" }));

    const response = await getCsv(ctx.app, TEST_ADMIN_TOKEN);
    const withoutBom = response.body.replace(/^\uFEFF/u, "");

    // The newline survives inside the quoted cell rather than becoming a new row.
    expect(withoutBom).toContain("Birinci satır\nİkinci satır");
    expect(withoutBom.trimEnd().split("\r\n")).toHaveLength(2);
  });
});
