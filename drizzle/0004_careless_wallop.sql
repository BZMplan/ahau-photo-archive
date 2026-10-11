ALTER TABLE `moderation_logs` ADD `metadata_changes` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `publication_id` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `photos` ADD `rejection_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `photos_publication_id_unique` ON `photos` (`publication_id`);