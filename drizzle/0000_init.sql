CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`name` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `characters_world_idx` ON `characters` (`world_id`);--> statement-breakpoint
CREATE TABLE `episode_characters` (
	`episode_id` text NOT NULL,
	`character_id` text NOT NULL,
	PRIMARY KEY(`episode_id`, `character_id`),
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `episode_lore` (
	`episode_id` text NOT NULL,
	`lore_id` text NOT NULL,
	PRIMARY KEY(`episode_id`, `lore_id`),
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lore_id`) REFERENCES `lore`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`episode_number` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`instruction` text DEFAULT '' NOT NULL,
	`previous_summary` text DEFAULT '' NOT NULL,
	`accepted_generation_id` text,
	`summary` text DEFAULT '' NOT NULL,
	`summary_draft` text,
	`summary_draft_source` text,
	`summary_generation_id` text,
	`writing_provider_id` text,
	`writing_model` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_world_number_uq` ON `episodes` (`world_id`,`episode_number`);--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`prompt_snapshot` text NOT NULL,
	`generation_settings` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`finish_reason` text,
	`usage` text,
	`revision_of` text,
	`revision_note` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generations_episode_idx` ON `generations` (`episode_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`generation_id` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt` text NOT NULL,
	`instruction` text DEFAULT '' NOT NULL,
	`file_path` text NOT NULL,
	`thumb_path` text,
	`mime` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `images_episode_idx` ON `images` (`episode_id`);--> statement-breakpoint
CREATE TABLE `lore` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lore_world_idx` ON `lore` (`world_id`);--> statement-breakpoint
CREATE TABLE `provider_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider_type` text NOT NULL,
	`base_url` text NOT NULL,
	`encrypted_api_key` text,
	`default_text_model` text DEFAULT '' NOT NULL,
	`default_summary_model` text DEFAULT '' NOT NULL,
	`default_image_model` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`base_instruction` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
