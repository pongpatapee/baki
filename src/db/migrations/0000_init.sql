CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`exercise_type` text NOT NULL,
	`equipment` text NOT NULL,
	`primary_muscle` text NOT NULL,
	`secondary_muscles` text DEFAULT '[]' NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`notes` text,
	`merged_into_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `exercises_name_idx` ON `exercises` (`name`);--> statement-breakpoint
CREATE TABLE `personal_records` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`workout_id` text NOT NULL,
	`workout_set_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` real NOT NULL,
	`achieved_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `personal_records_exercise_idx` ON `personal_records` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `personal_records_workout_idx` ON `personal_records` (`workout_id`);--> statement-breakpoint
CREATE TABLE `routine_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`superset_group` text,
	`rest_seconds` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `routine_exercises_routine_idx` ON `routine_exercises` (`routine_id`);--> statement-breakpoint
CREATE TABLE `routine_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `routine_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`set_type` text DEFAULT 'normal' NOT NULL,
	`target_weight_kg` real,
	`target_reps` integer,
	`target_duration_s` integer,
	`target_distance_m` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `routine_sets_re_idx` ON `routine_sets` (`routine_exercise_id`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text,
	`name` text NOT NULL,
	`notes` text,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `routines_folder_idx` ON `routines` (`folder_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`superset_group` text,
	`rest_seconds` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_idx` ON `workout_exercises` (`workout_id`);--> statement-breakpoint
CREATE INDEX `workout_exercises_exercise_idx` ON `workout_exercises` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`set_type` text DEFAULT 'normal' NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`duration_s` integer,
	`distance_m` real,
	`rpe` real,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `workout_sets_we_idx` ON `workout_sets` (`workout_exercise_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text,
	`title` text NOT NULL,
	`notes` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`import_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `workouts_started_idx` ON `workouts` (`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `workouts_import_key_idx` ON `workouts` (`import_key`);