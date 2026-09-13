import { snapToSpacing } from '@/lib/classes';
import { clampWidth } from '@/lib/stage';

type SerializedNodeLike = { type?: { resolvedName?: string } | string };

function resolvedTypeName(node: SerializedNodeLike | undefined): string | undefined {
  return typeof node?.type === 'string' ? node.type : node?.type?.resolvedName;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Normalizes a layout JSON string for equality comparison: parses it and
 * re-stringifies with every object's keys sorted, recursively, so two
 * encodings of the same tree that differ only in key order compare equal.
 * That mismatch is not hypothetical: Postgres's `jsonb` column does not
 * preserve object key insertion order on round-trip, and Craft.js's own
 * parse-then-serialize doesn't reliably reproduce the exact key order it
 * was given either. Array element order is preserved (arrays here are
 * ordered lists, e.g. a node's children), only object keys are sorted.
 */
export function canonicalLayout(json: string): string {
  return JSON.stringify(sortKeysDeep(JSON.parse(json)));
}

export type ValidateLayoutResult =
  | { ok: true; tree: Record<string, unknown> }
  | { ok: false; reason: string };

export function validateLayout(json: string, knownTypes: ReadonlySet<string>): ValidateLayoutResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || !('ROOT' in parsed)) {
    return { ok: false, reason: 'has no ROOT node' };
  }

  for (const [id, node] of Object.entries(parsed as Record<string, SerializedNodeLike>)) {
    const name = resolvedTypeName(node);
    if (!name || !knownTypes.has(name)) {
      return { ok: false, reason: `uses an unknown block "${name}" (node ${id})` };
    }
  }

  return { ok: true, tree: parsed as Record<string, unknown> };
}

type LayoutBoxLikeNode = SerializedNodeLike & {
  props?: { gapPx?: unknown; paddingPx?: unknown; gap?: unknown; padding?: unknown } & Record<string, unknown>;
};

/**
 * Rewrites every LayoutBox node's legacy `gap`/`padding` (Tailwind spacing
 * units, from layouts saved before the 8 px spacing scale landed) into
 * `gapPx`/`paddingPx`, deleting the legacy keys. Must run on the raw JSON
 * string BEFORE a layout is deserialized by Craft: Craft merges each node's
 * `craft.props` defaults on deserialize, so by the time a legacy node's
 * props are inspected at runtime `gapPx` already appears "present" (as the
 * merged-in default) and the real legacy `gap` value is never converted -
 * see `normalizeSpacing` in lib/classes.ts, which only helps when `gapPx` is
 * genuinely absent.
 *
 * A no-op, returning `json` unchanged, when the string is not valid JSON;
 * validateLayout is what rejects that, not this function.
 */
export function normalizeLayout(json: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }

  if (typeof parsed !== 'object' || parsed === null) return json;

  for (const node of Object.values(parsed as Record<string, LayoutBoxLikeNode>)) {
    if (resolvedTypeName(node) !== 'LayoutBox') continue;
    const props = node.props;
    if (!props) continue;

    if (props.gapPx === undefined && typeof props.gap === 'number') {
      props.gapPx = snapToSpacing(props.gap * 4);
    }
    delete props.gap;

    if (props.paddingPx === undefined && typeof props.padding === 'number') {
      props.paddingPx = snapToSpacing(props.padding * 4);
    }
    delete props.padding;
  }

  return JSON.stringify(parsed);
}

// A file holds several of these (files.screens, migration 0002). `layout` is
// the JSON string form here and everywhere in the API and repository; only
// the database stores it parsed, inside the screens jsonb column (see
// toStoredScreen/toApiScreens in lib/files/repository.ts).
//
// `x`/`y` are the frame's position on the infinite canvas (spec
// docs/superpowers/specs/2026-09-12-infinite-canvas-design.md section 5):
// canvas-space integer px, both present or both null together - never one
// without the other (validateScreens enforces this). A screen predating this
// feature has both null; components/workbench/workbench.tsx runs
// lib/files/layout.ts's layoutMissingPositions over the file's screens on
// load to fill them in before the canvas ever renders one.
export type Screen = {
  id: string;
  name: string;
  layout: string;
  stageWidth: number;
  stageHeight?: number | null;
  deviceName?: string | null;
  x?: number | null;
  y?: number | null;
  // The page (files.pages, migration 0003) this screen belongs to. Optional
  // here for the same reason folderId/screenCount are optional on
  // FileSummary/FileRecord in repository.ts: a Screen literal written
  // before pages existed (there are many, across component tests that
  // render a screens array purely for UI rendering and never look at
  // pageId at all) still type-checks with no pageId. The repository always
  // populates it on any value it hands back for real data - see create()/
  // save()'s pageId-stamping there - and validateScreens below cross-checks
  // it against a file's pages whenever a caller actually cares (passing its
  // third, optional pageIds argument).
  pageId?: string;
};

// The shape validateScreens accepts: a screen as given by a caller (the API
// after zod's shape-only check, or the repository's own internal callers
// such as create()'s default screen and lib/examples's exampleToScreens),
// before the content rules below have normalized it into a Screen.
export type ScreenInput = {
  id: string;
  name: string;
  layout: string;
  stageWidth: number;
  stageHeight?: number | null;
  deviceName?: string | null;
  x?: number | null;
  y?: number | null;
  pageId?: string;
};

export type ValidateScreensResult = { ok: true; screens: Screen[] } | { ok: false; reason: string };

const SCREEN_NAME_MAX = 80;
const SCREEN_ID_LENGTH = 10;
const DEVICE_NAME_MAX = 80;

// A file holds several pages (files.pages, migration 0003), each an ordered
// `{ id, name }` - see the module comment on Screen.pageId above for how the
// two connect. Deliberately the same shape for input and output (unlike
// Screen/ScreenInput): a page has no nested content of its own to
// normalize into a different representation, just an id and a trimmed name.
export type Page = { id: string; name: string };
export type PageInput = { id: string; name: string };
export type ValidatePagesResult = { ok: true; pages: Page[] } | { ok: false; reason: string };

const PAGE_NAME_MAX = 80;
const PAGE_ID_LENGTH = 10;

/**
 * Validates and normalizes a whole file's pages array: ids unique and
 * exactly 10 characters (the same nanoid(10) convention every other id in
 * this app uses), names trimmed to 1..80 characters, and at least one page
 * present - which is also, by construction, the entire enforcement of "the
 * last page cannot be deleted": a patch that would leave zero pages simply
 * never validates.
 */
export function validatePages(input: PageInput[]): ValidatePagesResult {
  if (input.length < 1) {
    return { ok: false, reason: 'a file must have at least one page' };
  }

  const seenIds = new Set<string>();
  const pages: Page[] = [];

  for (const raw of input) {
    if (raw.id.length !== PAGE_ID_LENGTH) {
      return { ok: false, reason: `page id "${raw.id}" must be exactly ${PAGE_ID_LENGTH} characters` };
    }
    if (seenIds.has(raw.id)) {
      return { ok: false, reason: `duplicate page id "${raw.id}"` };
    }
    seenIds.add(raw.id);

    const name = raw.name.trim();
    if (name.length < 1 || name.length > PAGE_NAME_MAX) {
      return { ok: false, reason: `page name must be between 1 and ${PAGE_NAME_MAX} characters` };
    }

    pages.push({ id: raw.id, name });
  }

  return { ok: true, pages };
}

/**
 * Validates and normalizes a whole file's screens array in one pass: every
 * screen's layout must pass validateLayout, names are trimmed to 1..80
 * characters, widths are clamped to the same [120, 3840] range a lone
 * stageWidth always was, stageHeight (when given) must be a positive
 * integer, deviceName (when given) must be at most 80 characters, ids must
 * be exactly 10 characters and unique within the array, and at least one
 * screen must be present. zod (lib/files/http.ts) only checks the shape (an
 * array of 1..50 objects with the right field types); this is where the
 * content rules live, the same split validateLayout already has with the
 * zod `layout: z.string()` check
 * one level up.
 *
 * `pageIds`, third and optional, cross-checks each screen's `pageId`
 * against a file's actual pages (validatePages's own output ids) - skipped
 * entirely when omitted, which is what keeps every pre-pages caller and
 * test fixture validating exactly as before pages existed. A real caller
 * that has pages to check against - the repository's create()/save() -
 * always passes it.
 */
export function validateScreens(
  input: ScreenInput[],
  knownTypes: ReadonlySet<string>,
  pageIds?: ReadonlySet<string>,
): ValidateScreensResult {
  if (input.length < 1) {
    return { ok: false, reason: 'a file must have at least one screen' };
  }

  const seenIds = new Set<string>();
  const screens: Screen[] = [];

  for (const raw of input) {
    if (raw.id.length !== SCREEN_ID_LENGTH) {
      return { ok: false, reason: `screen id "${raw.id}" must be exactly ${SCREEN_ID_LENGTH} characters` };
    }
    if (seenIds.has(raw.id)) {
      return { ok: false, reason: `duplicate screen id "${raw.id}"` };
    }
    seenIds.add(raw.id);

    const name = raw.name.trim();
    if (name.length < 1 || name.length > SCREEN_NAME_MAX) {
      return { ok: false, reason: `screen name must be between 1 and ${SCREEN_NAME_MAX} characters` };
    }

    const validatedLayout = validateLayout(raw.layout, knownTypes);
    if (!validatedLayout.ok) {
      return { ok: false, reason: `screen "${name}" layout ${validatedLayout.reason}` };
    }

    if (pageIds && (!raw.pageId || !pageIds.has(raw.pageId))) {
      return { ok: false, reason: `screen "${name}" pageId does not name a page of this file` };
    }

    const stageHeight = raw.stageHeight ?? null;
    if (stageHeight !== null && (!Number.isInteger(stageHeight) || stageHeight <= 0)) {
      return { ok: false, reason: `screen "${name}" stageHeight must be a positive integer or null` };
    }

    const deviceName = raw.deviceName ?? null;
    if (deviceName !== null && deviceName.length > DEVICE_NAME_MAX) {
      return { ok: false, reason: `screen "${name}" deviceName must be at most ${DEVICE_NAME_MAX} characters` };
    }

    const x = raw.x ?? null;
    const y = raw.y ?? null;
    if ((x === null) !== (y === null)) {
      return { ok: false, reason: `screen "${name}" must have both x and y, or neither` };
    }
    if (x !== null && !Number.isInteger(x)) {
      return { ok: false, reason: `screen "${name}" x must be an integer` };
    }
    if (y !== null && !Number.isInteger(y)) {
      return { ok: false, reason: `screen "${name}" y must be an integer` };
    }

    screens.push({
      id: raw.id,
      name,
      layout: raw.layout,
      stageWidth: clampWidth(raw.stageWidth),
      stageHeight,
      deviceName,
      x,
      y,
      pageId: raw.pageId,
    });
  }

  return { ok: true, screens };
}

/**
 * True when a serialised Craft tree contains a ROOT node. Craft serialises
 * `{}` when its store is empty (before a frame has deserialised, or after a
 * teardown), and such a tree must never be treated as a layout worth
 * saving.
 */
export function hasRootNode(json: string): boolean {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null && 'ROOT' in parsed;
  } catch {
    return false;
  }
}
