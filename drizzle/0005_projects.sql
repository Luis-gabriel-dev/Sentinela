CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo` text NOT NULL,
	`topic_id` integer,
	`stale_days` integer DEFAULT 7 NOT NULL,
	`notes` text,
	`description` text,
	`html_url` text,
	`default_branch` text,
	`language` text,
	`stars` integer DEFAULT 0 NOT NULL,
	`open_issues` integer DEFAULT 0 NOT NULL,
	`open_prs` integer DEFAULT 0 NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`last_commit_at` integer,
	`last_commit_message` text,
	`last_commit_url` text,
	`weekly_commits` text DEFAULT '[]' NOT NULL,
	`synced_at` integer,
	`sync_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_repo_unique` ON `projects` (`repo`);