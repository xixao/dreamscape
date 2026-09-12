import { z } from 'zod';
import { getDb } from '@/db/client';
import { createFilesRepository } from './repository';

export async function getRepository() {
  return createFilesRepository(await getDb());
}

// Shared with saveBody below: same rules the repository applies to a file
// name (trimmed, non-empty, capped at 120 characters).
const nameField = z.string().trim().min(1).max(120).optional();

// Shared by files' and folders' bodies: the id of a folder to place
// something into. Optional and nullable so "absent" (don't change, or
// create at the top level) is distinguishable from an explicit `null`
// ("move to the top level").
const folderIdField = z.string().nullable().optional();

// Shape only: id/name/layout/stageWidth types, nothing about content. The
// content rules (name trimmed to 1..80, width clamped to [320, 1920], ids
// unique and exactly 10 characters, layout valid against the known block
// types, at least one screen) live in validateScreens (lib/files/validate.ts),
// called from the repository - the same split validateLayout already had
// with this module's own `layout: z.string()` check one level up.
const screenField = z.object({
  id: z.string().min(1),
  name: z.string(),
  layout: z.string(),
  stageWidth: z.number().int(),
  stageHeight: z.number().int().nullable().optional(),
  deviceName: z.string().nullable().optional(),
});

const screensField = z.array(screenField).min(1).max(50);

export const createBody = z.object({
  name: nameField,
  example: z.enum(['login', 'dashboard', 'settings', 'signup']).optional(),
  folderId: folderIdField,
  screens: screensField.optional(),
});

export type CreateBody = z.infer<typeof createBody>;

// zod v4 deprecates `z.string().datetime()` in favor of `z.iso.datetime()`;
// using the latter here. Its default (no `offset`/`precision` options)
// requires a `Z`-suffixed, seconds-and-up timestamp, which is exactly what
// `Date.prototype.toISOString()` (what the repository returns) produces.
export const saveBody = z
  .object({
    name: nameField,
    screens: screensField.optional(),
    baseUpdatedAt: z.iso.datetime().optional(),
    folderId: folderIdField,
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.screens !== undefined ||
      body.folderId !== undefined,
    'empty patch',
  );

export type SaveBody = z.infer<typeof saveBody>;

// Same rules as a file name (trimmed, non-empty, capped at 120 characters),
// but required on create: unlike a file, a folder has no "Untitled" default.
const folderNameField = z.string().trim().min(1).max(120);

export const createFolderBody = z.object({
  name: folderNameField,
  parentId: folderIdField,
});

export type CreateFolderBody = z.infer<typeof createFolderBody>;

export const updateFolderBody = z
  .object({
    name: folderNameField.optional(),
    parentId: folderIdField,
  })
  .refine((body) => body.name !== undefined || body.parentId !== undefined, 'empty patch');

export type UpdateFolderBody = z.infer<typeof updateFolderBody>;
