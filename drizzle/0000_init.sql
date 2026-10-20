CREATE TABLE `block_checkins` (
	`block_id` integer NOT NULL,
	`date` text NOT NULL,
	PRIMARY KEY(`block_id`, `date`),
	FOREIGN KEY (`block_id`) REFERENCES `schedule_blocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `schedule_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`topic_id` integer,
	`color` text,
	`recurrence` text NOT NULL,
	`weekday` integer,
	`date` text,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`topic_id` integer,
	`priority` text DEFAULT 'normal' NOT NULL,
	`due_date` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_topic_idx` ON `tasks` (`topic_id`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`description` text,
	`position` integer DEFAULT 0 NOT NULL,
	`track_progress` integer DEFAULT false NOT NULL,
	`weekly_goal` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `topics_parent_idx` ON `topics` (`parent_id`);