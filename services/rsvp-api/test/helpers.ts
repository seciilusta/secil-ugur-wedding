import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/config/env.js";

/**
 * Test harness.
 *
 * Every test file gets a freshly migrated SQLite database in its own temporary
 * directory, so nothing touches the real `data/rsvp.sqlite` and the files can be
 * removed wholesale afterwards. Requests go through `app.inject()`, which
 * exercises the full Fastify pipeline — CORS, rate limiting, error handling —
 * without binding a port.
 */

export const TEST_ADMIN_TOKEN = "test-admin-token-0123456789abcdef";
export const TEST_ORIGIN = "http://localhost:3000";

export interface TestContext {
  app: FastifyInstance;
  config: AppConfig;
  databasePath: string;
  cleanup: () => Promise<void>;
}

export async function createTestApp(overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<TestContext> {
  const directory = mkdtempSync(path.join(tmpdir(), "rsvp-api-test-"));
  const databasePath = path.join(directory, "rsvp.sqlite");

  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_PATH: databasePath,
    RSVP_ADMIN_TOKEN: TEST_ADMIN_TOKEN,
    RSVP_MAX_GUESTS: "10",
    WEB_ORIGINS: TEST_ORIGIN,
    LOG_LEVEL: "silent",
    ...overrides,
  });

  const app = await buildApp({ config });
  await app.ready();

  return {
    app,
    config,
    databasePath,
    cleanup: async () => {
      await app.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** A complete, valid RSVP body. Spread and override in individual tests. */
export function validSubmission(overrides: Record<string, unknown> = {}) {
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

export function postRsvp(app: FastifyInstance, body: unknown) {
  return app.inject({
    method: "POST",
    url: "/v1/rsvp",
    headers: { "content-type": "application/json", origin: TEST_ORIGIN },
    payload: JSON.stringify(body),
  });
}

export function getCsv(app: FastifyInstance, token?: string) {
  return app.inject({
    method: "GET",
    url: "/v1/rsvp/export.csv",
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
}
