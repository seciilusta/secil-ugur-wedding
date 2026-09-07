import { z } from "zod";
import { site } from "@/config/site";

/**
 * The only place in the frontend that talks HTTP to the RSVP API.
 *
 * Components never call `fetch` themselves — they call the functions below and
 * receive either data or a ready-to-display Turkish message. There is no
 * database logic here and no admin credential ever reaches this file: the CSV
 * export is protected by a bearer token that lives only on the server.
 *
 * The wire contract is documented in the repository README.
 */

const REQUEST_TIMEOUT_MS = 10_000;
const SUBMISSION_TOKEN_STORAGE_KEY = "secil-ugur-wedding:rsvp-submission-token";

/* ------------------------------------------------------------------ types */

export type Attendance = "yes" | "no";

export interface RsvpSubmission {
  submissionToken: string;
  fullName: string;
  attendance: Attendance;
  guestCount: number;
  note: string;
  /** Honeypot. Always submitted empty by real guests. */
  website: string;
}

export interface RsvpResult {
  status: "created" | "updated";
  attendance: Attendance;
  guestCount: number;
}

export interface RsvpPublicConfig {
  maxGuests: number;
}

/** Every failure the form has to be able to explain to a guest. */
export type RsvpErrorKind = "network" | "timeout" | "validation" | "rateLimited" | "server";

export class RsvpError extends Error {
  readonly kind: RsvpErrorKind;
  /** Field-level messages returned by the API, keyed by field name. */
  readonly fieldErrors: Partial<Record<keyof RsvpSubmission, string>>;

  constructor(
    kind: RsvpErrorKind,
    message: string,
    options?: { cause?: unknown; fieldErrors?: Partial<Record<keyof RsvpSubmission, string>> },
  ) {
    super(message, { cause: options?.cause });
    this.name = "RsvpError";
    this.kind = kind;
    this.fieldErrors = options?.fieldErrors ?? {};
  }
}

/* --------------------------------------------------- response validation */

const successSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    status: z.enum(["created", "updated"]),
    attendance: z.enum(["yes", "no"]),
    guestCount: z.number().int().min(0),
  }),
});

const errorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});

const publicConfigSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    maxGuests: z.number().int().min(1),
  }),
});

/* --------------------------------------------------------- submission token */

/**
 * Same-device duplicate prevention.
 *
 * A random token is minted once per browser and reused on every submission, so a
 * guest who fills the form twice updates their own answer instead of creating a
 * second row. It is deliberately not derived from the guest's name, and it never
 * appears in the URL.
 *
 * This is not authentication. A guest using a second device, a different browser
 * or a cleared browser will create a new row, and nothing stops someone from
 * submitting under any name. It only prevents accidental duplicates.
 */
export function getSubmissionToken(): string {
  const fresh = crypto.randomUUID();

  try {
    const existing = window.localStorage.getItem(SUBMISSION_TOKEN_STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
    window.localStorage.setItem(SUBMISSION_TOKEN_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Private mode, disabled storage or a blocked third-party context. The RSVP
    // still has to work, it just cannot be linked to a later edit.
    return fresh;
  }
}

/* ------------------------------------------------------------------ fetch */

function resolveApiUrl(path: string): URL {
  return new URL(path.startsWith("/") ? path : `/${path}`, window.location.origin);
}

async function requestJson(url: URL, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    // An aborted request is our own timeout firing; anything else is the network.
    if (controller.signal.aborted) {
      throw new RsvpError("timeout", site.rsvp.errors.timeout, { cause });
    }
    throw new RsvpError("network", site.rsvp.errors.network, { cause });
  } finally {
    window.clearTimeout(timeout);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) return payload;

  const parsedError = errorSchema.safeParse(payload);

  if (response.status === 429) {
    throw new RsvpError("rateLimited", site.rsvp.errors.rateLimited);
  }

  if (response.status === 400 || response.status === 422) {
    throw new RsvpError("validation", site.rsvp.errors.validation, {
      fieldErrors: parsedError.success ? parsedError.data.error.fields : undefined,
    });
  }

  // 5xx and anything unexpected: never surface the server's own wording.
  throw new RsvpError("server", site.rsvp.errors.server);
}

/* -------------------------------------------------------------- public API */

/**
 * Reads the authoritative form limits from the API.
 *
 * Optional by design: if the API is unreachable the form falls back to
 * `site.rsvp.maxGuests` so a guest can still fill it in.
 */
export async function fetchRsvpConfig(): Promise<RsvpPublicConfig> {
  const url = resolveApiUrl("v1/rsvp/config");
  const payload = await requestJson(url, { method: "GET", headers: { Accept: "application/json" } });

  const parsed = publicConfigSchema.safeParse(payload);
  if (!parsed.success) {
    throw new RsvpError("server", site.rsvp.errors.server);
  }
  return parsed.data.data;
}

/** Submits or updates this browser's RSVP. */
export async function submitRsvp(submission: RsvpSubmission): Promise<RsvpResult> {
  const url = resolveApiUrl("v1/rsvp");

  const payload = await requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(submission),
  });

  const parsed = successSchema.safeParse(payload);
  if (!parsed.success) {
    throw new RsvpError("server", site.rsvp.errors.server);
  }
  return parsed.data.data;
}
