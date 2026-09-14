CREATE TABLE `review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`revision_id` text NOT NULL,
	`choice` text NOT NULL,
	`rationale` text NOT NULL,
	`follow_up_owner` text NOT NULL,
	`next_step` text NOT NULL,
	`author` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `review_decisions_owner_revision` ON `review_decisions` (`owner`,`revision_id`);