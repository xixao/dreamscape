CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`revision_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`author` text NOT NULL,
	`state` text NOT NULL,
	`viewport` text NOT NULL,
	`anchor` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`assignee` text DEFAULT 'Unassigned' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_owner_revision` ON `comments` (`owner`,`revision_id`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`owner` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`comment_id` text NOT NULL,
	`actor` text NOT NULL,
	PRIMARY KEY(`comment_id`, `actor`)
);
--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`number` integer NOT NULL,
	`config` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `revisions_owner_number` ON `revisions` (`owner`,`number`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`owner` text NOT NULL,
	`revision_id` text NOT NULL,
	`outcome` text DEFAULT 'started' NOT NULL,
	`duration` integer,
	`feedback` text DEFAULT '' NOT NULL,
	`events` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_owner` ON `sessions` (`owner`);--> statement-breakpoint
CREATE TABLE `shares` (
	`token` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`revision_id` text NOT NULL,
	`audience` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shares_owner` ON `shares` (`owner`);