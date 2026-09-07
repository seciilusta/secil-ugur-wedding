import { z } from "zod";

const databaseUrlSchema = z
  .string()
  .min(1, "DATABASE_URL is required.")
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "postgres:" || protocol === "postgresql:";
    } catch {
      return false;
    }
  }, "DATABASE_URL must be a PostgreSQL connection URL.");

const adminTokenSchema = z
  .string()
  .min(24, "RSVP_ADMIN_TOKEN must be at least 24 characters.")
  .refine((value) => value !== "replace-with-a-long-random-token", "RSVP_ADMIN_TOKEN is still the placeholder.");

const rateLimitSecretSchema = z.string().min(32, "RATE_LIMIT_SECRET must be at least 32 characters.");
const maxGuestsSchema = z.coerce.number().int().min(1).max(50).default(10);

type Environment = Readonly<Record<string, string | undefined>>;

function parseEnvironmentValue<T>(name: string, schema: z.ZodType<T>, source: Environment): T {
  const parsed = schema.safeParse(source[name]);
  if (!parsed.success) {
    throw new Error(`${name}: ${parsed.error.issues[0]?.message ?? "invalid value"}`);
  }
  return parsed.data;
}

export function getDatabaseUrl(source: Environment = process.env): string {
  return parseEnvironmentValue("DATABASE_URL", databaseUrlSchema, source);
}

export function getAdminToken(source: Environment = process.env): string {
  return parseEnvironmentValue("RSVP_ADMIN_TOKEN", adminTokenSchema, source);
}

export function getRateLimitSecret(source: Environment = process.env): string {
  return parseEnvironmentValue("RATE_LIMIT_SECRET", rateLimitSecretSchema, source);
}

export function getMaxGuests(source: Environment = process.env): number {
  return parseEnvironmentValue("RSVP_MAX_GUESTS", maxGuestsSchema, source);
}
