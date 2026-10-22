CREATE TABLE `rag_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_key` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` integer NOT NULL,
	`highlight_id` integer,
	`page` integer,
	`topic_id` integer,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`embedding` blob,
	`embed_model` text
);
--> statement-breakpoint
CREATE INDEX `rag_chunks_source_idx` ON `rag_chunks` (`source_key`);--> statement-breakpoint
CREATE TABLE `rag_sources` (
	`source_key` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `summary_until` integer;--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `compacted_at` integer;--> statement-breakpoint
ALTER TABLE `ai_messages` ADD `sources` text;