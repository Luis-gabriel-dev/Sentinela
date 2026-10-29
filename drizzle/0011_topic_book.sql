ALTER TABLE `topics` ADD `book_id` integer REFERENCES books(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `topics` ADD `book_location` text;