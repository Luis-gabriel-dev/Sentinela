ALTER TABLE `ai_messages` ADD `proposal` text;--> statement-breakpoint
ALTER TABLE `schedule_blocks` ADD `project_id` integer REFERENCES projects(id) ON UPDATE no action ON DELETE set null;