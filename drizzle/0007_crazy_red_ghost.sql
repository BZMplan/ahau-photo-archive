CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "locations_name_check" CHECK(length(trim("locations"."name")) > 0 and length("locations"."normalized_name") > 0),
	CONSTRAINT "locations_active_check" CHECK("locations"."is_active" in (0, 1)),
	CONSTRAINT "locations_sort_check" CHECK("locations"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_name_unique` ON `locations` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `locations_normalized_name_unique` ON `locations` (`normalized_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `locations_slug_unique` ON `locations` (`slug`);--> statement-breakpoint
CREATE INDEX `locations_active_sort_idx` ON `locations` (`is_active`,`sort_order`,`id`);--> statement-breakpoint
ALTER TABLE `photos` ADD `location_id` text REFERENCES locations(id) ON DELETE RESTRICT;--> statement-breakpoint
CREATE INDEX `photos_location_id_idx` ON `photos` (`location_id`,`status`);--> statement-breakpoint
ALTER TABLE `tags` ADD `normalized_name` text;--> statement-breakpoint
ALTER TABLE `tags` ADD `description` text;--> statement-breakpoint
ALTER TABLE `tags` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `tags` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tags` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_normalized_name_unique` ON `tags` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `tags_active_sort_idx` ON `tags` (`is_active`,`sort_order`,`id`);
--> statement-breakpoint
-- Preserve every historical tag and relation; only one exact normalized name remains selectable.
UPDATE tags SET normalized_name = normalize_location(name)
WHERE normalize_location(name) <> ''
  AND id = (SELECT min(candidate.id) FROM tags AS candidate WHERE normalize_location(candidate.name) = normalize_location(tags.name));
--> statement-breakpoint
UPDATE tags SET is_active = 0 WHERE normalized_name IS NULL;
--> statement-breakpoint
UPDATE tags SET updated_at = created_at;
