CREATE TABLE `moderation_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`admin_id` text NOT NULL,
	`action` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "moderation_logs_action_check" CHECK("moderation_logs"."action" in ('approve', 'reject', 'hide', 'restore', 'edit')),
	CONSTRAINT "moderation_logs_from_status_check" CHECK("moderation_logs"."from_status" in ('pending', 'approved', 'rejected', 'hidden')),
	CONSTRAINT "moderation_logs_to_status_check" CHECK("moderation_logs"."to_status" in ('pending', 'approved', 'rejected', 'hidden'))
);
--> statement-breakpoint
CREATE INDEX `moderation_logs_photo_created_idx` ON `moderation_logs` (`photo_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `moderation_logs_admin_created_idx` ON `moderation_logs` (`admin_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `photo_tags` (
	`photo_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`photo_id`, `tag_id`),
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photo_tags_tag_idx` ON `photo_tags` (`tag_id`,`photo_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`location` text,
	`taken_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`original_key` text NOT NULL,
	`display_key` text,
	`thumbnail_key` text,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`submitted_at` integer NOT NULL,
	`published_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "photos_status_check" CHECK("photos"."status" in ('pending', 'approved', 'rejected', 'hidden')),
	CONSTRAINT "photos_size_check" CHECK("photos"."byte_size" > 0),
	CONSTRAINT "photos_dimensions_check" CHECK(("photos"."width" is null or "photos"."width" > 0) and ("photos"."height" is null or "photos"."height" > 0)),
	CONSTRAINT "photos_approved_assets_check" CHECK("photos"."status" != 'approved' or ("photos"."display_key" is not null and "photos"."thumbnail_key" is not null and "photos"."published_at" is not null))
);
--> statement-breakpoint
CREATE INDEX `photos_submission_idx` ON `photos` (`submission_id`);--> statement-breakpoint
CREATE INDEX `photos_status_published_idx` ON `photos` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `photos_status_taken_idx` ON `photos` (`status`,`taken_at`);--> statement-breakpoint
CREATE INDEX `photos_status_location_idx` ON `photos` (`status`,`location`);--> statement-breakpoint
CREATE UNIQUE INDEX `photos_original_key_unique` ON `photos` (`original_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `photos_display_key_unique` ON `photos` (`display_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `photos_thumbnail_key_unique` ON `photos` (`thumbnail_key`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`attribution` text,
	`contact` text,
	`submitted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `submissions_submitted_at_idx` ON `submissions` (`submitted_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);