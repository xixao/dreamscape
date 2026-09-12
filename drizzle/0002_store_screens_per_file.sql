ALTER TABLE "files" ADD COLUMN "screens" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE "files" SET "screens" = jsonb_build_array(jsonb_build_object('id', substr(md5(id), 1, 10), 'name', 'Frame 1', 'layout', "layout", 'stageWidth', "stage_width"));--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN "layout";--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN "stage_width";
