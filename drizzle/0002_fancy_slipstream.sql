ALTER TABLE `sessions` ADD `interactions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `rating` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `fuego` integer DEFAULT 0 NOT NULL;