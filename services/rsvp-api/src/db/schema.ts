import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One row per RSVP response.
 *
 * Timestamps are stored as ISO 8601 strings in UTC rather than epoch integers:
 * they sort correctly as text, they are readable straight out of the CSV export,
 * and there is no timezone ambiguity when the database is copied between hosts.
 */
export const rsvps = sqliteTable(
  "rsvps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    /**
     * Random per-browser token used to recognise a resubmission. Unique, so a
     * guest who fills the form again updates their own row instead of adding a
     * second one. Deliberately not derived from the guest's name.
     */
    submissionToken: text("submission_token").notNull().unique(),

    fullName: text("full_name").notNull(),

    attendance: text("attendance", { enum: ["yes", "no"] }).notNull(),

    /** Always 0 for a guest who is not attending. */
    guestCount: integer("guest_count").notNull().default(0),

    note: text("note").notNull().default(""),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),

    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("rsvps_created_at_idx").on(table.createdAt)],
);

export type RsvpRow = typeof rsvps.$inferSelect;
export type NewRsvpRow = typeof rsvps.$inferInsert;
