CREATE TABLE `book_ocr_pages` (
	`book_id` integer NOT NULL,
	`page` integer NOT NULL,
	`text` text NOT NULL,
	`lines` text NOT NULL,
	`confidence` real NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`book_id`, `page`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
