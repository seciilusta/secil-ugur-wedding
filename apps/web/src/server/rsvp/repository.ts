export type Attendance = "yes" | "no";

export interface StoredRsvp {
  id: number;
  submissionToken: string;
  fullName: string;
  attendance: Attendance;
  guestCount: number;
  note: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertRsvpInput {
  submissionToken: string;
  fullName: string;
  attendance: Attendance;
  guestCount: number;
  note: string;
  now: Date;
}

export interface RateLimitInput {
  fingerprint: string;
  windowStart: Date;
  expiresAt: Date;
  now: Date;
}

export interface RsvpRepository {
  ping(): Promise<void>;
  consumeRateLimit(input: RateLimitInput): Promise<number>;
  upsertRsvp(input: UpsertRsvpInput): Promise<{ status: "created" | "updated" }>;
  listRsvps(): Promise<StoredRsvp[]>;
}
