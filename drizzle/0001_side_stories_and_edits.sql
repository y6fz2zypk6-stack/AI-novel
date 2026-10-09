DROP INDEX `episodes_world_number_uq`;--> statement-breakpoint
ALTER TABLE `episodes` ADD `kind` text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE `episodes` ADD `base_episode_id` text REFERENCES episodes(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_world_kind_number_uq` ON `episodes` (`world_id`,`kind`,`episode_number`);--> statement-breakpoint
ALTER TABLE `generations` ADD `original_content` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `edited_at` integer;