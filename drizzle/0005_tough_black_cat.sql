CREATE TABLE `cache_purge_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`keys` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cache_purge_tasks_photo_idx` ON `cache_purge_tasks` (`photo_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cache_purge_tasks_status_idx` ON `cache_purge_tasks` (`status`,`updated_at`);