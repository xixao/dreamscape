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

// Shape only: id/name types, nothing about content. The content rules (ids
// unique and exactly 10 characters, names trimmed to 1..80, at least one
// page) live in validatePages (lib/files/validate.ts), called from the
// repository - same split every other content rule here already has.
const pageField = z.object({
  id: z.string().min(1),
  name: z.string(),
});

const pagesField = z.array(pageField).min(1).max(50);

// Shape only: id/name/layout/stageWidth types, nothing about content. The
// content rules (name trimmed to 1..80, width clamped to [120, 3840], ids
// unique and exactly 10 characters, layout valid against the known block
// types, at least one screen, pageId naming a real page) live in
// validateScreens (lib/files/validate.ts), called from the repository - the
// same split validateLayout already had with this module's own `layout:
// z.string()` check one level up.
const screenField = z.object({
  id: z.string().min(1),
  name: z.string(),
  layout: z.string(),
  stageWidth: z.number().int(),
  stageHeight: z.number().int().nullable().optional(),
  deviceName: z.string().nullable().optional(),
  // The frame's canvas position (spec docs/superpowers/specs/2026-09-12-
  // infinite-canvas-design.md section 5): shape only here (an optional,
  // nullable integer, same as stageHeight above) - the "both or neither"
  // rule lives in validateScreens (lib/files/validate.ts), same split every
  // other content rule already has one level down from this zod check.
  x: z.number().int().nullable().optional(),
  y: z.number().int().nullable().optional(),
  // The page (files.pages, migration 0003) this screen belongs to. Optional
  // here, same as on the Screen/ScreenInput types themselves: a caller that
  // has not adopted pages yet gets stamped with the file's default page by
  // the repository (see stampMissingPageId in lib/files/repository.ts)
  // rather than being rejected for a merely absent field.
  pageId: z.string().min(1).optional(),
});

const screensField = z.array(screenField).min(1).max(50);

export const createBody = z.object({
  name: nameField,
  example: z.enum(['login', 'dashboard', 'settings', 'signup']).optional(),
  folderId: folderIdField,
  pages: pagesField.optional(),
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
    pages: pagesField.optional(),
    screens: screensField.optional(),
    baseUpdatedAt: z.iso.datetime().optional(),
    folderId: folderIdField,
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.pages !== undefined ||
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
