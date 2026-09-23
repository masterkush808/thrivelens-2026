ALTER TABLE `profiles` ADD `goal_timeline` text;--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text,
	`kind` text DEFAULT 'meal_prep' NOT NULL,
	`title` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`detail_json` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `schedules_user_idx` ON `schedules` (`user_id`,`status`,`scheduled_for`);