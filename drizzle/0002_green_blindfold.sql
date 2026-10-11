CREATE TABLE `image_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`action` text NOT NULL,
	`state` text NOT NULL,
	`objects` text NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `image_operations_state_created_idx` ON `image_operations` (`state`,`created_at`);--> statement-breakpoint
ALTER TABLE `photos` ADD `preview_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `photos_preview_key_unique` ON `photos` (`preview_key`);