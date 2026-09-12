import { type AnyPgColumn, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
  layout: jsonb('layout').notNull(),
  stageWidth: integer('stage_width').notNull().default(1440),
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
