import { componentLibrarySchema } from '@/lib/custom-components/model';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { ARROW_KINDS, CONNECTOR_KINDS, DIAGRAM_COLORS, LINE_STYLES, NODE_KINDS, TEXT_COLORS, TEXT_FONTS, TEXT_SIZES } from '@/lib/diagram/store';
import { createFilesRepository } from './repository';
import { OVERLAY_SIDES, PRESENTATION_TYPES, SCREEN_KINDS, TOAST_POSITIONS } from './validate';

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

// Shape only, for one edge endpoint's `{ nodeId | screenId, side? }` (spec
// docs/superpowers/specs/2026-09-13-diagrams-design.md section 2) - the
// "exactly one of nodeId/screenId, and a real side" content rule lives in
// validateDiagram (lib/files/validate.ts), same split as everything below.
const diagramEndpointField = z.object({
  nodeId: z.string().min(1).optional(),
  screenId: z.string().min(1).optional(),
  side: z.enum(['top', 'right', 'bottom', 'left']).optional(),
});

const diagramNodeField = z.object({
  id: z.string().min(1),
  kind: z.enum(NODE_KINDS),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  text: z.string(),
  color: z.enum(DIAGRAM_COLORS),
  // Spec section 9: all three optional, absent on every diagram saved
  // before this feature - validateDiagram (lib/files/validate.ts) is the
  // content rule for callers that reach it without going through this zod
  // shape at all (e.g. its own unit tests), same split as kind/color above.
  textSize: z.enum(TEXT_SIZES).optional(),
  textFont: z.enum(TEXT_FONTS).optional(),
  textColor: z.enum(TEXT_COLORS).optional(),
  // Marquee selection and groups (spec section 10) - shape only (a
  // non-empty string), same split as everything else here; validateDiagram
  // is the content rule.
  groupId: z.string().min(1).optional(),
});

const diagramEdgeField = z.object({
  id: z.string().min(1),
  source: diagramEndpointField,
  target: diagramEndpointField,
  kind: z.enum(CONNECTOR_KINDS),
  arrow: z.enum(ARROW_KINDS),
  // Spec section 14: the connector's LINE style, optional - absent on
  // every edge saved before this feature. Shape only, same split as
  // everything else here; validateDiagram (lib/files/validate.ts) is the
  // content rule for callers that reach it without this zod shape at all.
  lineStyle: z.enum(LINE_STYLES).optional(),
  label: z.string().optional(),
});

// Shape only: a page's diagram is an optional `{ nodes, edges }` (spec
// section 2) - ids unique, positive sizes, known kinds/colors and an edge's
// node references are validateDiagram's own content rules, called from
// validatePages (lib/files/validate.ts).
const diagramField = z.object({
  nodes: z.array(diagramNodeField).max(500),
  edges: z.array(diagramEdgeField).max(1000),
});

// Shape only: id/name types, nothing about content. The content rules (ids
// unique and exactly 10 characters, names trimmed to 1..80, at least one
// page) live in validatePages (lib/files/validate.ts), called from the
// repository - same split every other content rule here already has.
const pageField = z.object({
  id: z.string().min(1),
  name: z.string(),
  diagram: diagramField.optional(),
});

const pagesField = z.array(pageField).min(1).max(50);

// Shape only, for an overlay frame's presentation (spec docs/superpowers/
// specs/2026-09-13-overlay-frames-design.md section 2): the known enum for
// each key, every key but `type` optional. Which keys a given `type`
// requires - and which it must not carry - is validatePresentation's
// content rule (lib/files/validate.ts), called from validateScreens, the
// same split as everything else in this module. A strict object, unlike
// every other shape here: the spec's "must match the union exactly" holds
// at the wire too, so an unknown key is a 400 rather than silently
// stripped before validatePresentation could reject it.
const overlayPresentationField = z.strictObject({
  type: z.enum(PRESENTATION_TYPES),
  dismissible: z.boolean().optional(),
  side: z.enum(OVERLAY_SIDES).optional(),
  position: z.enum(TOAST_POSITIONS).optional(),
});

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
  appearance: z.enum(['light', 'dark', 'internal-light', 'internal-dark']).optional(),
  stageHeight: z.number().int().nullable().optional(),
  deviceName: z.string().nullable().optional(),
  // Overlay frames (spec section 2): `kind` absent means a plain screen.
  // Shape only again - "a presentation exactly when kind is 'overlay'"
  // lives in validateScreens (lib/files/validate.ts).
  kind: z.enum(SCREEN_KINDS).optional(),
  presentation: overlayPresentationField.optional(),
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
  // The frame's layout grid overlay (spec docs/superpowers/specs/2026-09-
  // 13-grid-snapping-alignment-design.md section 5): shape only here - the
  // range checks on columns/gutter/margin and the boolean check on visible
  // live in validateScreens (lib/files/validate.ts), same split every other
  // content rule already has one level down from this zod check.
  layoutGrid: z
    .object({
      columns: z.number().int(),
      gutter: z.number().int(),
      margin: z.number().int(),
      visible: z.boolean(),
    })
    .optional(),
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
    appearance: z.enum(['light', 'dark', 'internal-light', 'internal-dark']).optional(),
    components: componentLibrarySchema.optional(),
    screens: screensField.optional(),
    baseUpdatedAt: z.iso.datetime().optional(),
    folderId: folderIdField,
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.pages !== undefined ||
      body.appearance !== undefined ||
      body.components !== undefined ||
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
