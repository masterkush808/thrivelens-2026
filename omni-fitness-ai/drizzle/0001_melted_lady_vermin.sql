PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_food_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`logged_at` text NOT NULL,
	`meal_type` text NOT NULL,
	`food_name` text NOT NULL,
	`calories` integer DEFAULT 0 NOT NULL,
	`protein` real DEFAULT 0 NOT NULL,
	`carbs` real DEFAULT 0 NOT NULL,
	`fat` real DEFAULT 0 NOT NULL,
	`fiber` real,
	`image_uri` text,
	`ai_confidence` real,
	`ai_model_version` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_food_logs`("id", "user_id", "logged_at", "meal_type", "food_name", "calories", "protein", "carbs", "fat", "fiber", "image_uri", "ai_confidence", "ai_model_version", "created_at") SELECT "id", "user_id", "logged_at", "meal_type", "food_name", "calories", "protein", "carbs", "fat", "fiber", "image_uri", "ai_confidence", "ai_model_version", "created_at" FROM `food_logs`;--> statement-breakpoint
DROP TABLE `food_logs`;--> statement-breakpoint
ALTER TABLE `__new_food_logs` RENAME TO `food_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_progress_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`logged_at` text NOT NULL,
	`weight` real,
	`body_fat` real,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_progress_logs`("id", "user_id", "logged_at", "weight", "body_fat", "notes", "created_at") SELECT "id", "user_id", "logged_at", "weight", "body_fat", "notes", "created_at" FROM `progress_logs`;--> statement-breakpoint
DROP TABLE `progress_logs`;--> statement-breakpoint
ALTER TABLE `__new_progress_logs` RENAME TO `progress_logs`;--> statement-breakpoint
CREATE TABLE `__new_workout_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`session_id` text,
	`logged_at` text NOT NULL,
	`sets_completed` integer DEFAULT 0 NOT NULL,
	`reps` text,
	`weight` real,
	`duration_seconds` integer,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workout_logs`("id", "user_id", "exercise_id", "session_id", "logged_at", "sets_completed", "reps", "weight", "duration_seconds", "notes", "created_at") SELECT "id", "user_id", "exercise_id", "session_id", "logged_at", "sets_completed", "reps", "weight", "duration_seconds", "notes", "created_at" FROM `workout_logs`;--> statement-breakpoint
DROP TABLE `workout_logs`;--> statement-breakpoint
ALTER TABLE `__new_workout_logs` RENAME TO `workout_logs`;--> statement-breakpoint
CREATE TABLE `__new_workout_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`goal` text,
	`days_per_week` integer DEFAULT 4 NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workout_plans`("id", "user_id", "name", "description", "goal", "days_per_week", "is_custom", "is_active", "created_at", "updated_at") SELECT "id", "user_id", "name", "description", "goal", "days_per_week", "is_custom", "is_active", "created_at", "updated_at" FROM `workout_plans`;--> statement-breakpoint
DROP TABLE `workout_plans`;--> statement-breakpoint
ALTER TABLE `__new_workout_plans` RENAME TO `workout_plans`;--> statement-breakpoint
CREATE TABLE `__new_workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text,
	`day_id` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`total_volume` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `workout_plans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`day_id`) REFERENCES `workout_days`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_workout_sessions`("id", "user_id", "plan_id", "day_id", "started_at", "completed_at", "total_volume", "created_at") SELECT "id", "user_id", "plan_id", "day_id", "started_at", "completed_at", "total_volume", "created_at" FROM `workout_sessions`;--> statement-breakpoint
DROP TABLE `workout_sessions`;--> statement-breakpoint
ALTER TABLE `__new_workout_sessions` RENAME TO `workout_sessions`;