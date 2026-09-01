import { z } from "zod";

/**
 * Environment validation.
 *
 * The process refuses to start on an invalid environment rather than failing
 * later on the first request. See `.env.example` for the full list.
 */

const MIN_ADMIN_TOKEN_LENGTH = 24;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  HOST: z.string().min(1).default("0.0.0.0"),

  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),

  DATABASE_PATH: z.string().min(1).default("./data/rsvp.sqlite"),

  /** Bearer token for the CSV export. Never sent to the frontend. */
  RSVP_ADMIN_TOKEN: z
    .string()
    .min(
      MIN_ADMIN_TOKEN_LENGTH,
      `RSVP_ADMIN_TOKEN must be at least ${MIN_ADMIN_TOKEN_LENGTH} characters. Generate one with: openssl rand -hex 32`,
    )
    .refine((value) => value !== "replace-with-a-long-random-token", {
      error: "RSVP_ADMIN_TOKEN is still the placeholder from .env.example. Generate a real one.",
    }),

  /**
   * Authoritative maximum party size. The frontend shows its own default from
   * `site.rsvp.maxGuests`; keep the two numbers equal or the form will offer a
   * count this API rejects.
   */
  RSVP_MAX_GUESTS: z.coerce.number().int().min(1).max(50).default(10),

  /** Comma-separated CORS allowlist, e.g. "https://a.com,https://b.com". */
  WEB_ORIGINS: z.string().min(1).default("http://localhost:3000"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  nodeEnv: Env["NODE_ENV"];
  isProduction: boolean;
  host: string;
  port: number;
  databasePath: string;
  adminToken: string;
  maxGuests: number;
  webOrigins: string[];
  logLevel: Env["LOG_LEVEL"];
}

function parseOrigins(raw: string, isProduction: boolean): string[] {
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error("WEB_ORIGINS resolved to an empty allowlist.");
  }

  // A wildcard in production would let any site post RSVPs on a guest's behalf.
  if (isProduction && origins.includes("*")) {
    throw new Error(
      'WEB_ORIGINS may not be "*" when NODE_ENV=production. List the exact origins that serve the website.',
    );
  }

  for (const origin of origins) {
    if (origin === "*") continue;
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`WEB_ORIGINS contains "${origin}", which is not a valid origin.`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`WEB_ORIGINS contains "${origin}", which is not an http(s) origin.`);
    }
  }

  return origins;
}

/** Validates a raw environment and returns the configuration the app runs on. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === "production";

  return {
    nodeEnv: env.NODE_ENV,
    isProduction,
    host: env.HOST,
    port: env.PORT,
    databasePath: env.DATABASE_PATH,
    adminToken: env.RSVP_ADMIN_TOKEN,
    maxGuests: env.RSVP_MAX_GUESTS,
    webOrigins: parseOrigins(env.WEB_ORIGINS, isProduction),
    logLevel: env.LOG_LEVEL,
  };
}
