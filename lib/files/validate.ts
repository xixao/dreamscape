import { clampWidth } from '@/lib/stage';

type SerializedNodeLike = { type?: { resolvedName?: string } | string };

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
    const name = typeof node?.type === 'string' ? node.type : node?.type?.resolvedName;
    if (!name || !knownTypes.has(name)) {
      return { ok: false, reason: `uses an unknown block "${name}" (node ${id})` };
    }
  }

  return { ok: true, tree: parsed as Record<string, unknown> };
}

// A file holds several of these (files.screens, migration 0002). `layout` is
// the JSON string form here and everywhere in the API and repository; only
// the database stores it parsed, inside the screens jsonb column (see
// toStoredScreen/toApiScreens in lib/files/repository.ts).
export type Screen = {
  id: string;
  name: string;
  layout: string;
  stageWidth: number;
  stageHeight?: number | null;
  deviceName?: string | null;
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
};

export type ValidateScreensResult = { ok: true; screens: Screen[] } | { ok: false; reason: string };

const SCREEN_NAME_MAX = 80;
const SCREEN_ID_LENGTH = 10;

/**
 * Validates and normalizes a whole file's screens array in one pass: every
 * screen's layout must pass validateLayout, names are trimmed to 1..80
 * characters, widths are clamped to the same [320, 1920] range a lone
 * stageWidth always was, ids must be exactly 10 characters and unique
 * within the array, and at least one screen must be present. zod
 * (lib/files/http.ts) only checks the shape (an array of 1..50 objects with
 * the right field types); this is where the content rules live, the same
 * split validateLayout already has with the zod `layout: z.string()` check
 * one level up.
 */
export function validateScreens(input: ScreenInput[], knownTypes: ReadonlySet<string>): ValidateScreensResult {
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

    screens.push({
      id: raw.id,
      name,
      layout: raw.layout,
      stageWidth: clampWidth(raw.stageWidth),
      stageHeight: raw.stageHeight ?? null,
      deviceName: raw.deviceName ?? null,
    });
  }

  return { ok: true, screens };
}
