import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

const base = {
  RSVP_ADMIN_TOKEN: "test-admin-token-0123456789abcdef",
} satisfies NodeJS.ProcessEnv;

describe("environment validation", () => {
  it("fills in defaults for everything except the admin token", () => {
    const config = loadConfig({ ...base });

    expect(config).toMatchObject({
      nodeEnv: "development",
      host: "0.0.0.0",
      port: 4000,
      databasePath: "./data/rsvp.sqlite",
      maxGuests: 10,
      webOrigins: ["http://localhost:3000"],
    });
  });

  it("refuses to start without an admin token", () => {
    expect(() => loadConfig({})).toThrow(/RSVP_ADMIN_TOKEN/u);
  });

  it("refuses the placeholder admin token from .env.example", () => {
    expect(() => loadConfig({ RSVP_ADMIN_TOKEN: "replace-with-a-long-random-token" })).toThrow(
      /placeholder/u,
    );
  });

  it("refuses a short admin token", () => {
    expect(() => loadConfig({ RSVP_ADMIN_TOKEN: "too-short" })).toThrow(/at least 24/u);
  });

  it("parses a comma-separated CORS allowlist", () => {
    const config = loadConfig({
      ...base,
      WEB_ORIGINS: "https://secilveugur.com, https://www.secilveugur.com ",
    });

    expect(config.webOrigins).toEqual(["https://secilveugur.com", "https://www.secilveugur.com"]);
  });

  it("rejects an origin that is not a valid http(s) URL", () => {
    expect(() => loadConfig({ ...base, WEB_ORIGINS: "secilveugur.com" })).toThrow(/not a valid origin/u);
  });

  it("allows a wildcard in development but never in production", () => {
    expect(loadConfig({ ...base, WEB_ORIGINS: "*" }).webOrigins).toEqual(["*"]);

    expect(() => loadConfig({ ...base, NODE_ENV: "production", WEB_ORIGINS: "*" })).toThrow(
      /may not be "\*"/u,
    );
  });

  it("rejects an out-of-range guest maximum", () => {
    expect(() => loadConfig({ ...base, RSVP_MAX_GUESTS: "0" })).toThrow(/RSVP_MAX_GUESTS/u);
    expect(() => loadConfig({ ...base, RSVP_MAX_GUESTS: "abc" })).toThrow(/RSVP_MAX_GUESTS/u);
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadConfig({ ...base, PORT: "70000" })).toThrow(/PORT/u);
  });
});
