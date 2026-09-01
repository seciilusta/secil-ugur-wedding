CREATE TABLE `rsvps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`submission_token` text NOT NULL,
	`full_name` text NOT NULL,
	`attendance` text NOT NULL,
	`guest_count` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rsvps_submission_token_unique` ON `rsvps` (`submission_token`);--> statement-breakpoint
CREATE INDEX `rsvps_created_at_idx` ON `rsvps` (`created_at`);