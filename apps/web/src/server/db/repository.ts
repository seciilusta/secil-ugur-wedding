import { neon } from "@neondatabase/serverless";
import { asc, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getDatabaseUrl } from "@/server/config";
import { rsvpRateLimits, rsvps } from "@/server/db/schema";
import type { RateLimitInput, RsvpRepository, StoredRsvp, UpsertRsvpInput } from "@/server/rsvp/repository";

type Database = ReturnType<typeof createDatabase>;

function createDatabase(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema: { rsvps, rsvpRateLimits } });
}

export class NeonRsvpRepository implements RsvpRepository {
  constructor(private readonly db: Database) {}

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }

  async consumeRateLimit(input: RateLimitInput): Promise<number> {
    await this.db.delete(rsvpRateLimits).where(lt(rsvpRateLimits.expiresAt, input.now));

    const [entry] = await this.db
      .insert(rsvpRateLimits)
      .values({
        fingerprint: input.fingerprint,
        windowStart: input.windowStart,
        count: 1,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [rsvpRateLimits.fingerprint, rsvpRateLimits.windowStart],
        set: {
          count: sql`${rsvpRateLimits.count} + 1`,
          expiresAt: input.expiresAt,
        },
      })
      .returning({ count: rsvpRateLimits.count });

    if (!entry) throw new Error("Rate-limit counter did not return a row.");
    return entry.count;
  }

  async upsertRsvp(input: UpsertRsvpInput): Promise<{ status: "created" | "updated" }> {
    const [row] = await this.db
      .insert(rsvps)
      .values({
        submissionToken: input.submissionToken,
        fullName: input.fullName,
        attendance: input.attendance,
        guestCount: input.guestCount,
        note: input.note,
        revision: 1,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: rsvps.submissionToken,
        set: {
          fullName: input.fullName,
          attendance: input.attendance,
          guestCount: input.guestCount,
          note: input.note,
          revision: sql`${rsvps.revision} + 1`,
          updatedAt: input.now,
        },
      })
      .returning({ revision: rsvps.revision });

    if (!row) throw new Error("RSVP upsert did not return a row.");
    return { status: row.revision === 1 ? "created" : "updated" };
  }

  async listRsvps(): Promise<StoredRsvp[]> {
    return this.db.select().from(rsvps).orderBy(asc(rsvps.createdAt), asc(rsvps.id));
  }
}

let repository: NeonRsvpRepository | null = null;

export function getRsvpRepository(): NeonRsvpRepository {
  repository ??= new NeonRsvpRepository(createDatabase(getDatabaseUrl()));
  return repository;
}
