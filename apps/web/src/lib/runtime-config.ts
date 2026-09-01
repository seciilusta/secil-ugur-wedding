import { z } from "zod";

/**
 * Deployment-dependent configuration, read from `/runtime-config.json` in the
 * browser rather than baked in at build time.
 *
 * This is what makes the exported site portable: point `rsvpApiBaseUrl` at a
 * different server, reload, and the static bundle talks to the new API. No
 * rebuild, no redeploy of the frontend.
 */

const runtimeConfigSchema = z.object({
  rsvpApiBaseUrl: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => {
        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "rsvpApiBaseUrl must be an absolute http(s) URL" },
    ),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

/** Thrown when the file is missing, unreachable or does not match the schema. */
export class RuntimeConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RuntimeConfigError";
  }
}

const CONFIG_FILENAME = "runtime-config.json";
const CONFIG_TIMEOUT_MS = 8000;

let cached: Promise<RuntimeConfig> | null = null;

async function fetchRuntimeConfig(): Promise<RuntimeConfig> {
  // Resolved against the document base so the site also works when it is hosted
  // in a subdirectory rather than at the domain root.
  const url = new URL(CONFIG_FILENAME, document.baseURI);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: controller.signal });
  } catch (cause) {
    throw new RuntimeConfigError(`Could not load ${CONFIG_FILENAME}.`, { cause });
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new RuntimeConfigError(`${CONFIG_FILENAME} responded with HTTP ${response.status}.`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new RuntimeConfigError(`${CONFIG_FILENAME} is not valid JSON.`, { cause });
  }

  const parsed = runtimeConfigSchema.safeParse(json);
  if (!parsed.success) {
    throw new RuntimeConfigError(`${CONFIG_FILENAME} is malformed: ${parsed.error.issues[0]?.message}.`);
  }

  return parsed.data;
}

/** Loads and validates the runtime configuration once per page load. */
export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  cached ??= fetchRuntimeConfig().catch((error: unknown) => {
    // Allow a later retry to try again instead of replaying the failure forever.
    cached = null;
    throw error;
  });
  return cached;
}
