import { type AnyPgColumn, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const folders = pgTable('folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // Self-reference: the callback form (returning `AnyPgColumn`) defers
  // resolving `folders.id` until Drizzle actually needs it, which is the
  // only way to refer to a table from within its own column definitions.
  // `onDelete: 'restrict'` means a folder with subfolders cannot be
  // deleted until they are (removeFolder() in the repository checks this
  // itself and returns a typed result rather than letting the database
  // reject it, but the constraint is the source of truth).
  parentId: text('parent_id').references((): AnyPgColumn => folders.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const files = pgTable('files', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('Untitled'),
  // A file holds several pages (migration 0003), each an ordered
  // `{ id, name }` (see Page in lib/files/validate.ts) - its own infinite
  // canvas with its own frames, viewport and comment pins. Every screen in
  // `screens` below carries a `pageId` naming one of these. Stored directly
  // as plain objects (no nested layout, so no parse/stringify conversion is
  // needed the way screens' `layout` gets from toStoredScreen/toApiScreens).
  pages: jsonb('pages').notNull().default('[]'),
  // A file holds several screens (migration 0002 replaced the old single
  // `layout`/`stage_width` columns with this array); see Screen in
  // lib/files/validate.ts for the per-screen shape. Stored as an array of
  // plain objects with each screen's layout parsed (not double-encoded as
  // a string) - lib/files/repository.ts's toStoredScreen/toApiScreens
  // convert to and from the `layout: string` shape the API and repository
  // use everywhere else.
  screens: jsonb('screens').notNull().default('[]'),
  // Nullable: a file with no folderId lives at the top level. Same
  // `restrict` rationale as folders.parentId above.
  folderId: text('folder_id').references((): AnyPgColumn => folders.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
export type FolderRow = typeof folders.$inferSelect;
export type NewFolderRow = typeof folders.$inferInsert;
