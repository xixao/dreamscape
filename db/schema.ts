import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const files = pgTable('files', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('Untitled'),
  layout: jsonb('layout').notNull(),
  stageWidth: integer('stage_width').notNull().default(1440),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
