ALTER TABLE "files" ADD COLUMN "pages" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE "files" SET
	"pages" = jsonb_build_array(jsonb_build_object('id', substr(md5(id), 1, 10), 'name', 'Page 1')),
	"screens" = (
		SELECT COALESCE(jsonb_agg((elem.value || jsonb_build_object('pageId', substr(md5(files.id), 1, 10))) ORDER BY elem.ordinality), '[]'::jsonb)
		FROM jsonb_array_elements(files.screens) WITH ORDINALITY AS elem(value, ordinality)
	);
