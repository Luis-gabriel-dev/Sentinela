CREATE TABLE `book_highlights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`location` text NOT NULL,
	`sort_key` real DEFAULT 0 NOT NULL,
	`text` text NOT NULL,
	`color` text DEFAULT 'yellow' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `book_highlights_book_idx` ON `book_highlights` (`book_id`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`folder_id` integer,
	`topic_id` integer,
	`title` text NOT NULL,
	`author` text,
	`format` text NOT NULL,
	`file_path` text NOT NULL,
	`file_size` integer NOT NULL,
	`page_count` integer,
	`cover_version` integer DEFAULT 0 NOT NULL,
	`metadata_ready` integer DEFAULT false NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`location` text,
	`last_opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `library_folders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_file_path_unique` ON `books` (`file_path`);--> statement-breakpoint
CREATE INDEX `books_folder_idx` ON `books` (`folder_id`);--> statement-breakpoint
CREATE TABLE `library_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
