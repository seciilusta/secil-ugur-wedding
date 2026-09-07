import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, serial, timestamp, varchar, pgTable } from "drizzle-orm/pg-core";

export const rsvps = pgTable(
  "rsvps",
  {
    id: serial("id").primaryKey(),
    submissionToken: varchar("submission_token", { length: 128 }).notNull().unique(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    attendance: varchar("attendance", { length: 3 }).$type<"yes" | "no">().notNull(),
    guestCount: integer("guest_count").notNull().default(0),
    note: varchar("note", { length: 500 }).notNull().default(""),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    index("rsvps_created_at_idx").on(table.createdAt),
    check("rsvps_attendance_check", sql`${table.attendance} in ('yes', 'no')`),
    check("rsvps_guest_count_check", sql`${table.guestCount} >= 0`),
    check("rsvps_revision_check", sql`${table.revision} >= 1`),
  ],
);

export const rsvpRateLimits = pgTable(
  "rsvp_rate_limits",
  {
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, precision: 3 }).notNull(),
    count: integer("count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.fingerprint, table.windowStart] }),
    index("rsvp_rate_limits_expires_at_idx").on(table.expiresAt),
    check("rsvp_rate_limits_count_check", sql`${table.count} >= 1`),
  ],
);

export type RsvpRow = typeof rsvps.$inferSelect;
