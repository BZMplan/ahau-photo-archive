CREATE TABLE `bootstrap_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`password_change_required` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
