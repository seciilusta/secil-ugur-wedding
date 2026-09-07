CREATE TABLE "rsvp_rate_limits" (
	"fingerprint" varchar(64) NOT NULL,
	"window_start" timestamp (3) with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "rsvp_rate_limits_fingerprint_window_start_pk" PRIMARY KEY("fingerprint","window_start"),
	CONSTRAINT "rsvp_rate_limits_count_check" CHECK ("rsvp_rate_limits"."count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "rsvps" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_token" varchar(128) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"attendance" varchar(3) NOT NULL,
	"guest_count" integer DEFAULT 0 NOT NULL,
	"note" varchar(500) DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rsvps_submission_token_unique" UNIQUE("submission_token"),
	CONSTRAINT "rsvps_attendance_check" CHECK ("rsvps"."attendance" in ('yes', 'no')),
	CONSTRAINT "rsvps_guest_count_check" CHECK ("rsvps"."guest_count" >= 0),
	CONSTRAINT "rsvps_revision_check" CHECK ("rsvps"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX "rsvp_rate_limits_expires_at_idx" ON "rsvp_rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rsvps_created_at_idx" ON "rsvps" USING btree ("created_at");