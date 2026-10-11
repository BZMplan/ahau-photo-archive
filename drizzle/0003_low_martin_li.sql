CREATE TABLE `submission_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`state` text NOT NULL,
	`objects` text NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_operations_request_id_unique` ON `submission_operations` (`request_id`);--> statement-breakpoint
CREATE INDEX `submission_operations_state_idx` ON `submission_operations` (`state`);--> statement-breakpoint
CREATE TABLE `submission_rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`submission_count` integer DEFAULT 0 NOT NULL,
	`photo_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `submission_rate_limits_updated_idx` ON `submission_rate_limits` (`updated_at`);--> statement-breakpoint
ALTER TABLE `submissions` ADD `author_name` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `contact_email` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `message` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `consent_accepted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `consented_at` integer;--> statement-breakpoint
ALTER TABLE `submissions` ADD `request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_request_id_unique` ON `submissions` (`request_id`);