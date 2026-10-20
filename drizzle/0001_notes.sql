CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` integer,
	`title` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '[]' NOT NULL,
	`content_text` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notes_topic_idx` ON `notes` (`topic_id`);