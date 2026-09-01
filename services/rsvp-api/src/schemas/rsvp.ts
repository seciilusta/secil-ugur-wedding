import { z } from "zod";

/** Request validation for the RSVP endpoints. */

export const MAX_FULL_NAME_LENGTH = 120;
export const MAX_NOTE_LENGTH = 500;
export const MAX_TOKEN_LENGTH = 128;

/**
 * Collapses runs of whitespace and trims the ends.
 *
 * Deliberately leaves the characters themselves alone: no case folding and no
 * Unicode normalisation, so "Uğur", "Seçil" and "İpek" survive exactly as typed.
 */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/** Same as above but keeps paragraph breaks, which a note may legitimately use. */
export function normalizeNote(value: string): string {
  return value
    .split(/\r?\n/u)
    .map((line) => line.replace(/[^\S\n]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/**
 * Body schema for `POST /v1/rsvp`.
 *
 * Built per request because `guestCount` is bounded by the service's
 * authoritative `RSVP_MAX_GUESTS`, not by anything the client sends.
 */
export function buildRsvpBodySchema(maxGuests: number) {
  return z
    .object({
      submissionToken: z.string().trim().min(8).max(MAX_TOKEN_LENGTH),

      fullName: z
        .string()
        .transform(normalizeWhitespace)
        .refine((value) => value.length >= 2, { error: "fullName must be at least 2 characters." })
        .refine((value) => value.length <= MAX_FULL_NAME_LENGTH, {
          error: `fullName must be at most ${MAX_FULL_NAME_LENGTH} characters.`,
        }),

      attendance: z.enum(["yes", "no"], { error: 'attendance must be "yes" or "no".' }),

      guestCount: z.coerce
        .number({ error: "guestCount must be a number." })
        .int({ error: "guestCount must be a whole number." })
        .min(0, { error: "guestCount may not be negative." })
        .max(maxGuests, { error: `guestCount may be at most ${maxGuests}.` }),

      note: z
        .string()
        .default("")
        .transform(normalizeNote)
        .refine((value) => value.length <= MAX_NOTE_LENGTH, {
          error: `note must be at most ${MAX_NOTE_LENGTH} characters.`,
        }),

      /** Honeypot. A real guest never sees this field, so it must arrive empty. */
      website: z.string().max(200).optional().default(""),
    })
    .superRefine((values, ctx) => {
      if (values.attendance === "yes" && values.guestCount < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["guestCount"],
          message: "guestCount must be at least 1 when attending.",
        });
      }
    });
}

export type RsvpBody = z.infer<ReturnType<typeof buildRsvpBodySchema>>;
