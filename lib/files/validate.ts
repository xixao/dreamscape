import { isComponentLayout } from '@/lib/custom-components/model';
import { snapToSpacing } from '@/lib/classes';
import {
  ARROW_KINDS,
  CONNECTOR_KINDS,
  DIAGRAM_COLORS,
  LINE_STYLES,
  MAX_TEXT_LENGTH as DIAGRAM_TEXT_MAX,
  NODE_KINDS,
  TEXT_COLORS,
  TEXT_FONTS,
  TEXT_SIZES,
  type ArrowKind,
  type ConnectorKind,
  type DiagramColor,
  type DiagramData,
  type DiagramNodeKind,
  type EdgeEndpoint,
  type LineStyle,
  type Side,
  type TextColor,
  type TextFont,
  type TextSize,
} from '@/lib/diagram/store';
import { clampWidth } from '@/lib/stage';

type SerializedNodeLike = { props?: Record<string, unknown>; type?: { resolvedName?: string } | string };

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
    if (name === 'CustomComponent' && (typeof node?.props?.layout !== 'string' || !isComponentLayout(node.props.layout))) {
      return { ok: false, reason: 'Invalid custom component definition' };
    }
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

// --- Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
// design.md section 2) ---

// A modal-type overlay - a dialog, a sheet or a toast - is its own frame: a
// Screen with `kind: 'overlay'`, opened by the prototype (an openOverlay
// interaction, lib/interactions.ts) rather than designed inside the
// requesting screen. `presentation` says how Play mode
// (components/play/player.tsx) wraps its layout; an alert dialog is simply
// a dialog with `dismissible: false`.
export const OVERLAY_SIDES = ['left', 'right', 'top', 'bottom'] as const;
export type OverlaySide = (typeof OVERLAY_SIDES)[number];

export const TOAST_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
export type ToastPosition = (typeof TOAST_POSITIONS)[number];

// The one list of presentation types, shared by the zod shape
// (lib/files/http.ts), validatePresentation below and the overlay defaults
// (lib/files/screens.ts), so the three can never disagree.
export const PRESENTATION_TYPES = ['dialog', 'sheet', 'toast'] as const;
export type OverlayPresentationType = (typeof PRESENTATION_TYPES)[number];

export type OverlayPresentation =
  | { type: 'dialog'; dismissible: boolean }
  | { type: 'sheet'; side: OverlaySide; dismissible: boolean }
  | { type: 'toast'; position: ToastPosition };

export const SCREEN_KINDS = ['screen', 'overlay'] as const;
export type ScreenKind = (typeof SCREEN_KINDS)[number];

// The shape validatePresentation accepts: loose on purpose. zod
// (lib/files/http.ts) has already checked the API's shape (known enums for
// each key), but validatePresentation below is the one place that decides
// whether a presentation matches the OverlayPresentation union exactly -
// which keys a given `type` requires, and which it must not have - so it
// takes anything object-shaped and narrows it itself, the same way every
// other content rule in this module works one level below its zod check.
export type OverlayPresentationInput = Record<string, unknown>;

// A frame's layout grid overlay (spec docs/superpowers/specs/2026-09-13-
// grid-snapping-alignment-design.md section 5), like Figma's own per-frame
// layout grids: columns evenly spaced by `gutter` px, inset `margin` px
// from each edge, shown when `visible`. Optional on Screen (undefined, not
// a stored default) - components/workbench/layout-grid.tsx's own
// DEFAULT_LAYOUT_GRID (12 / 24 / 32 / false) is what a screen with none
// renders as, the same "default lives at the read site, not in storage"
// convention stageHeight/deviceName already use.
export type LayoutGrid = { columns: number; gutter: number; margin: number; visible: boolean };

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
  appearance?: 'light' | 'dark' | 'internal-light' | 'internal-dark';
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
  // Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
  // design.md section 2): absent means a plain screen - no migration, every
  // screen saved before overlays existed simply has neither key. When
  // `kind` is 'overlay', `presentation` is required and says how Play mode
  // wraps the layout; on a plain screen a presentation is rejected
  // (validateScreens below). lib/files/screens.ts has isOverlay() and the
  // overlay defaults (createOverlayScreen).
  kind?: ScreenKind;
  presentation?: OverlayPresentation;
  layoutGrid?: LayoutGrid;
};

// The shape validateScreens accepts: a screen as given by a caller (the API
// after zod's shape-only check, or the repository's own internal callers
// such as create()'s default screen and lib/examples's exampleToScreens),
// before the content rules below have normalized it into a Screen.
export type ScreenInput = {
  appearance?: 'light' | 'dark' | 'internal-light' | 'internal-dark';
  id: string;
  name: string;
  layout: string;
  stageWidth: number;
  stageHeight?: number | null;
  deviceName?: string | null;
  x?: number | null;
  y?: number | null;
  pageId?: string;
  kind?: string;
  presentation?: OverlayPresentationInput;
  layoutGrid?: LayoutGrid;
};

export type ValidateScreensResult = { ok: true; screens: Screen[] } | { ok: false; reason: string };

const SCREEN_NAME_MAX = 80;
const SCREEN_ID_LENGTH = 10;
const DEVICE_NAME_MAX = 80;
const LAYOUT_GRID_COLUMNS_MAX = 24;
const LAYOUT_GRID_GUTTER_MAX = 200;
const LAYOUT_GRID_MARGIN_MAX = 400;

/** All four fields are required together when `layoutGrid` is present at all - there is no per-field default at this layer (see the LayoutGrid type's own doc comment for where the actual 12/24/32/false defaults live). */
function validateLayoutGrid(screenName: string, grid: LayoutGrid): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(grid.columns) || grid.columns < 1 || grid.columns > LAYOUT_GRID_COLUMNS_MAX) {
    return {
      ok: false,
      reason: `screen "${screenName}" layoutGrid columns must be an integer between 1 and ${LAYOUT_GRID_COLUMNS_MAX}`,
    };
  }
  if (!Number.isInteger(grid.gutter) || grid.gutter < 0 || grid.gutter > LAYOUT_GRID_GUTTER_MAX) {
    return {
      ok: false,
      reason: `screen "${screenName}" layoutGrid gutter must be an integer between 0 and ${LAYOUT_GRID_GUTTER_MAX}`,
    };
  }
  if (!Number.isInteger(grid.margin) || grid.margin < 0 || grid.margin > LAYOUT_GRID_MARGIN_MAX) {
    return {
      ok: false,
      reason: `screen "${screenName}" layoutGrid margin must be an integer between 0 and ${LAYOUT_GRID_MARGIN_MAX}`,
    };
  }
  if (typeof grid.visible !== 'boolean') {
    return { ok: false, reason: `screen "${screenName}" layoutGrid visible must be a boolean` };
  }
  return { ok: true };
}

// A file holds several pages (files.pages, migration 0003), each an ordered
// `{ id, name }` - see the module comment on Screen.pageId above for how the
// two connect. `diagram` (spec docs/superpowers/specs/2026-09-13-diagrams-
// design.md section 2) is the page's own flow chart, living next to its
// screens rather than inside any one of them - optional, so a file saved
// before diagrams existed (or a page nobody has drawn on) keeps working
// with no migration needed.
export type Page = { id: string; name: string; diagram?: DiagramData };
export type PageInput = { id: string; name: string; diagram?: DiagramInput };
export type ValidatePagesResult = { ok: true; pages: Page[] } | { ok: false; reason: string };

const PAGE_NAME_MAX = 80;
const PAGE_ID_LENGTH = 10;

/**
 * Validates and normalizes a whole file's pages array: ids unique and
 * exactly 10 characters (the same nanoid(10) convention every other id in
 * this app uses), names trimmed to 1..80 characters, and at least one page
 * present - which is also, by construction, the entire enforcement of "the
 * last page cannot be deleted": a patch that would leave zero pages simply
 * never validates. A page's own `diagram`, when present, is validated
 * through validateDiagram below and the failure reason is prefixed with the
 * page's name, same as validateScreens already does for a screen's layout.
 * validateDiagram only checks a diagram's OWN internal consistency (node
 * ids, positive sizes, known kinds/colors, an edge's node references); it
 * has no way to know which screens belong to this same page (screens are
 * validated separately, and pages are validated before them - see
 * lib/files/repository.ts), so a screenId edge endpoint is only checked
 * here as "look like an id", not "names a real screen on this page" -
 * validateDiagramReferences below is the cross-check for that, composed by
 * the repository once both pages and screens are known.
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

    let diagram: DiagramData | undefined;
    if (raw.diagram !== undefined) {
      const validatedDiagram = validateDiagram(raw.diagram);
      if (!validatedDiagram.ok) {
        return { ok: false, reason: `page "${name}" ${validatedDiagram.reason}` };
      }
      diagram = validatedDiagram.diagram;
    }

    pages.push({ id: raw.id, name, ...(diagram !== undefined ? { diagram } : {}) });
  }

  return { ok: true, pages };
}

// Exactly the keys each presentation type carries (spec section 2's union):
// anything else on a presentation is rejected, not stripped, so a valid one
// comes out of validatePresentation identical to how it went in.
const PRESENTATION_KEYS: Record<OverlayPresentationType, readonly string[]> = {
  dialog: ['type', 'dismissible'],
  sheet: ['type', 'side', 'dismissible'],
  toast: ['type', 'position'],
};

function isPresentationType(type: unknown): type is OverlayPresentationType {
  return (PRESENTATION_TYPES as readonly unknown[]).includes(type);
}

export type ValidatePresentationResult =
  | { ok: true; presentation: OverlayPresentation }
  | { ok: false; reason: string };

/**
 * Checks one overlay frame's presentation against the OverlayPresentation
 * union exactly: a known `type`, every key that type requires with a value
 * of the right kind, and no key that type does not have - a dialog with a
 * `side`, a toast with a `dismissible`, or any unknown key is rejected
 * rather than silently dropped. Called from validateScreens for every
 * screen whose kind is 'overlay'; the reason it returns has no screen name
 * in it, validateScreens prefixes that itself (same as validateLayout's
 * reasons).
 */
export function validatePresentation(input: unknown): ValidatePresentationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, reason: 'presentation must be an object' };
  }
  const raw = input as Record<string, unknown>;
  const type = raw.type;
  if (!isPresentationType(type)) {
    return { ok: false, reason: 'presentation type must be "dialog", "sheet" or "toast"' };
  }

  for (const key of Object.keys(raw)) {
    if (!PRESENTATION_KEYS[type].includes(key)) {
      return { ok: false, reason: `presentation for a ${type} has an unexpected key "${key}"` };
    }
  }

  switch (type) {
    case 'dialog': {
      if (typeof raw.dismissible !== 'boolean') {
        return { ok: false, reason: 'presentation dismissible must be a boolean' };
      }
      return { ok: true, presentation: { type, dismissible: raw.dismissible } };
    }
    case 'sheet': {
      const side = raw.side;
      if (!(OVERLAY_SIDES as readonly unknown[]).includes(side)) {
        return { ok: false, reason: `presentation side must be one of ${OVERLAY_SIDES.join(', ')}` };
      }
      if (typeof raw.dismissible !== 'boolean') {
        return { ok: false, reason: 'presentation dismissible must be a boolean' };
      }
      return { ok: true, presentation: { type, side: side as OverlaySide, dismissible: raw.dismissible } };
    }
    case 'toast': {
      const position = raw.position;
      if (!(TOAST_POSITIONS as readonly unknown[]).includes(position)) {
        return { ok: false, reason: `presentation position must be one of ${TOAST_POSITIONS.join(', ')}` };
      }
      return { ok: true, presentation: { type, position: position as ToastPosition } };
    }
  }
}

/**
 * Validates and normalizes a whole file's screens array in one pass: every
 * screen's layout must pass validateLayout, names are trimmed to 1..80
 * characters, widths are clamped to the same [120, 3840] range a lone
 * stageWidth always was, stageHeight (when given) must be a positive
 * integer, deviceName (when given) must be at most 80 characters, ids must
 * be exactly 10 characters and unique within the array, at least one
 * screen must be present, and an overlay frame (kind 'overlay') must carry
 * a presentation matching the OverlayPresentation union exactly while a
 * plain screen must carry none (see validatePresentation above). zod
 * (lib/files/http.ts) only checks the shape (an
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

    // Overlay frames: kind is one of two values when given at all, and a
    // presentation is required exactly when kind is 'overlay' - never on a
    // plain screen. Both keys are left absent (not written as undefined)
    // when the caller gave none, so a screen saved before overlays existed
    // round-trips byte for byte.
    const kind = raw.kind;
    if (kind !== undefined && !(SCREEN_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, reason: `screen "${name}" kind must be "screen" or "overlay"` };
    }
    let presentation: OverlayPresentation | undefined;
    if (kind === 'overlay') {
      if (raw.presentation === undefined) {
        return { ok: false, reason: `screen "${name}" is an overlay but has no presentation` };
      }
      const validatedPresentation = validatePresentation(raw.presentation);
      if (!validatedPresentation.ok) {
        return { ok: false, reason: `screen "${name}" ${validatedPresentation.reason}` };
      }
      presentation = validatedPresentation.presentation;
    } else if (raw.presentation !== undefined) {
      return { ok: false, reason: `screen "${name}" has a presentation but is not an overlay` };
    }

    if (raw.layoutGrid !== undefined) {
      const validatedGrid = validateLayoutGrid(name, raw.layoutGrid);
      if (!validatedGrid.ok) return { ok: false, reason: validatedGrid.reason };
    }

    if (raw.appearance !== undefined && !['light', 'dark', 'internal-light', 'internal-dark'].includes(raw.appearance)) return { ok: false, reason: 'Invalid frame appearance' };
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
      ...(kind !== undefined ? { kind: kind as ScreenKind } : {}),
      ...(presentation !== undefined ? { presentation } : {}),
      layoutGrid: raw.layoutGrid,
      appearance: raw.appearance,
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

// --- Diagrams (spec docs/superpowers/specs/2026-09-13-diagrams-design.md) ---

// The shape validateDiagram accepts: loose primitive types only (zod, in
// lib/files/http.ts, checks this much before validateDiagram ever runs) -
// the content rules (unique ids, positive sizes, known kinds/colors, an
// edge's endpoints) live here, the same split every other content rule in
// this module already has one level below its own zod shape check.
export type DiagramEdgeEndpointInput = { nodeId?: string; screenId?: string; side?: string };
export type DiagramNodeInput = {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  textSize?: string;
  textFont?: string;
  textColor?: string;
  // Marquee selection and groups (spec docs/superpowers/specs/2026-09-13-
  // diagrams-design.md section 10): optional, a non-empty string when
  // present - see validateDiagram's own check below.
  groupId?: string;
};
export type DiagramEdgeInput = {
  id: string;
  source: DiagramEdgeEndpointInput;
  target: DiagramEdgeEndpointInput;
  kind: string;
  arrow: string;
  // Spec section 14: the connector's LINE style (solid/dashed), optional -
  // absent on every edge saved before this feature - checked against its
  // own enum in validateDiagram below, same shape as kind/arrow above.
  lineStyle?: string;
  label?: string;
};
export type DiagramInput = { nodes: DiagramNodeInput[]; edges: DiagramEdgeInput[] };
export type ValidateDiagramResult = { ok: true; diagram: DiagramData } | { ok: false; reason: string };

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

function isKnownSide(side: string | undefined): side is Side | undefined {
  return side === undefined || (SIDES as readonly string[]).includes(side);
}

// Exactly one of nodeId/screenId, never both or neither (spec section 2:
// "source: { nodeId | screenId, side? }") and, when given, a real side.
function isWellFormedEndpoint(endpoint: DiagramEdgeEndpointInput): boolean {
  const hasNode = typeof endpoint.nodeId === 'string' && endpoint.nodeId.length > 0;
  const hasScreen = typeof endpoint.screenId === 'string' && endpoint.screenId.length > 0;
  if (hasNode === hasScreen) return false;
  return isKnownSide(endpoint.side);
}

function toEndpoint(endpoint: DiagramEdgeEndpointInput): EdgeEndpoint {
  return {
    ...(endpoint.nodeId !== undefined ? { nodeId: endpoint.nodeId } : {}),
    ...(endpoint.screenId !== undefined ? { screenId: endpoint.screenId } : {}),
    ...(endpoint.side !== undefined ? { side: endpoint.side as Side } : {}),
  };
}

/**
 * Validates one page's diagram (lib/diagram/geometry.ts and store.ts hold
 * the actual maths and reducer this data feeds): every node and edge id
 * unique across BOTH collections together (the editor looks an id up by
 * plain string, e.g. store.ts's setText/setKind - a node and an edge must
 * never share one), every node's kind/color from their own enum, every
 * node's size positive, every node's text and every edge's label at most
 * 500 characters (spec: "text up to 500 chars"), every edge's endpoint
 * exactly one of a nodeId or a screenId with a real side when given, an
 * edge whose nodeId endpoint(s) reference a node that actually exists in
 * THIS diagram, and every edge's own kind/arrow from their own enum. An
 * edge's lineStyle (spec section 14) is optional and, when present,
 * checked against its own enum the same shape as kind/arrow. A
 * node's textSize/textFont/textColor (spec section 9) are all optional
 * and, when present, checked against their own enum the same way; absent,
 * they stay absent on the validated node rather than defaulting here, so
 * a file saved before this feature round-trips unchanged. See the module
 * comment on validatePages above for why a screenId endpoint is only
 * shape-checked here, not cross-referenced against real screens.
 */
export function validateDiagram(input: DiagramInput): ValidateDiagramResult {
  const seenIds = new Set<string>();
  const nodeIds = new Set(input.nodes.map((node) => node.id));

  for (const node of input.nodes) {
    if (seenIds.has(node.id)) return { ok: false, reason: `diagram id "${node.id}" is used more than once` };
    seenIds.add(node.id);

    if (!(NODE_KINDS as readonly string[]).includes(node.kind)) {
      return { ok: false, reason: `diagram node "${node.id}" has an unknown kind "${node.kind}"` };
    }
    if (!(DIAGRAM_COLORS as readonly string[]).includes(node.color)) {
      return { ok: false, reason: `diagram node "${node.id}" has an unknown color "${node.color}"` };
    }
    if (!(node.width > 0) || !(node.height > 0)) {
      return { ok: false, reason: `diagram node "${node.id}" must have a positive width and height` };
    }
    if (node.text.length > DIAGRAM_TEXT_MAX) {
      return { ok: false, reason: `diagram node "${node.id}" text is longer than ${DIAGRAM_TEXT_MAX} characters` };
    }
    // Spec section 9: textSize/textFont/textColor are all optional (absent
    // on every file saved before this feature), so only checked against
    // their own enum when actually present - same shape as kind/color's
    // own checks above, just skipped rather than failed when undefined.
    if (node.textSize !== undefined && !(TEXT_SIZES as readonly string[]).includes(node.textSize)) {
      return { ok: false, reason: `diagram node "${node.id}" has an unknown text size "${node.textSize}"` };
    }
    if (node.textFont !== undefined && !(TEXT_FONTS as readonly string[]).includes(node.textFont)) {
      return { ok: false, reason: `diagram node "${node.id}" has an unknown text font "${node.textFont}"` };
    }
    if (node.textColor !== undefined && !(TEXT_COLORS as readonly string[]).includes(node.textColor)) {
      return { ok: false, reason: `diagram node "${node.id}" has an unknown text color "${node.textColor}"` };
    }
    // Spec section 10: groupId is optional (absent on every diagram saved
    // before this feature) and, when present, a non-empty string - no
    // further shape constraint (unlike screen/page ids elsewhere, a
    // diagram node/edge id itself carries no length rule in this
    // validator either, only uniqueness).
    if (node.groupId !== undefined && (typeof node.groupId !== 'string' || node.groupId.length === 0)) {
      return { ok: false, reason: `diagram node "${node.id}" has an invalid groupId` };
    }
  }

  for (const edge of input.edges) {
    if (seenIds.has(edge.id)) return { ok: false, reason: `diagram id "${edge.id}" is used more than once` };
    seenIds.add(edge.id);

    if (!isWellFormedEndpoint(edge.source) || !isWellFormedEndpoint(edge.target)) {
      return { ok: false, reason: `diagram edge "${edge.id}" has an invalid source or target` };
    }
    if (edge.source.nodeId && !nodeIds.has(edge.source.nodeId)) {
      return { ok: false, reason: `diagram edge "${edge.id}" source references a node that does not exist` };
    }
    if (edge.target.nodeId && !nodeIds.has(edge.target.nodeId)) {
      return { ok: false, reason: `diagram edge "${edge.id}" target references a node that does not exist` };
    }
    if (!(CONNECTOR_KINDS as readonly string[]).includes(edge.kind)) {
      return { ok: false, reason: `diagram edge "${edge.id}" has an unknown kind "${edge.kind}"` };
    }
    if (!(ARROW_KINDS as readonly string[]).includes(edge.arrow)) {
      return { ok: false, reason: `diagram edge "${edge.id}" has an unknown arrow "${edge.arrow}"` };
    }
    // Spec section 14: lineStyle is optional (absent on every edge saved
    // before this feature), so only checked against its own enum when
    // actually present - same shape as kind/arrow's own checks just above.
    if (edge.lineStyle !== undefined && !(LINE_STYLES as readonly string[]).includes(edge.lineStyle)) {
      return { ok: false, reason: `diagram edge "${edge.id}" has an unknown line style "${edge.lineStyle}"` };
    }
    if (edge.label !== undefined && edge.label.length > DIAGRAM_TEXT_MAX) {
      return { ok: false, reason: `diagram edge "${edge.id}" label is longer than ${DIAGRAM_TEXT_MAX} characters` };
    }
  }

  return {
    ok: true,
    diagram: {
      // textSize/textFont/textColor destructured out of the `...rest`
      // spread (rather than spreading `node` whole and overriding them
      // after, the way kind/color do above) because a later conditional
      // spread narrows a property's TYPE only when nothing earlier in the
      // same literal already contributed one - `...rest` here never does,
      // so the three stay exactly `TextSize | undefined` and friends, and
      // - the actual point, same as toEndpoint's identical spread above for
      // an edge's optional `side` - absent stays absent (not a key set to
      // `undefined`), so a file saved before this feature round-trips
      // byte-identical.
      nodes: input.nodes.map(({ textSize, textFont, textColor, groupId, ...rest }) => ({
        ...rest,
        kind: rest.kind as DiagramNodeKind,
        color: rest.color as DiagramColor,
        ...(textSize !== undefined ? { textSize: textSize as TextSize } : {}),
        ...(textFont !== undefined ? { textFont: textFont as TextFont } : {}),
        ...(textColor !== undefined ? { textColor: textColor as TextColor } : {}),
        ...(groupId !== undefined ? { groupId } : {}),
      })),
      // lineStyle destructured out of the `...rest` spread (rather than
      // spread-then-overridden, the way kind/arrow/source/target are below)
      // for the same reason textSize/textFont/textColor are above: a later
      // conditional spread narrows a property's TYPE only when nothing
      // earlier in the same literal already contributed one, so this keeps
      // it exactly `LineStyle | undefined` and - the actual point - absent
      // stays absent (not a key set to `undefined`), so a file saved
      // before this feature round-trips byte-identical.
      edges: input.edges.map(({ lineStyle, ...rest }) => ({
        ...rest,
        source: toEndpoint(rest.source),
        target: toEndpoint(rest.target),
        kind: rest.kind as ConnectorKind,
        arrow: rest.arrow as ArrowKind,
        ...(lineStyle !== undefined ? { lineStyle: lineStyle as LineStyle } : {}),
      })),
    },
  };
}

/**
 * The cross-check validatePages cannot do on its own (see its own doc
 * comment above): every diagram edge whose source or target names a
 * screenId must name a screen that both exists and belongs to that same
 * page. Composed by the repository (lib/files/repository.ts) right after
 * both validatePages and validateScreens have each already succeeded on
 * their own slice, since only at that point are a file's pages AND its
 * screens (with their own pageId) both known.
 */
export function validateDiagramReferences(
  pages: readonly Page[],
  screens: readonly Screen[],
): { ok: true } | { ok: false; reason: string } {
  const screenIdsByPage = new Map<string, Set<string>>();
  for (const screen of screens) {
    if (!screen.pageId) continue;
    const set = screenIdsByPage.get(screen.pageId) ?? new Set<string>();
    set.add(screen.id);
    screenIdsByPage.set(screen.pageId, set);
  }

  for (const page of pages) {
    if (!page.diagram) continue;
    const screenIds = screenIdsByPage.get(page.id) ?? new Set<string>();
    for (const edge of page.diagram.edges) {
      for (const endpoint of [edge.source, edge.target]) {
        if (endpoint.screenId && !screenIds.has(endpoint.screenId)) {
          return {
            ok: false,
            reason: `page "${page.name}" diagram edge "${edge.id}" references a screen that is not on this page`,
          };
        }
      }
    }
  }

  return { ok: true };
}

/**
 * The lenient counterpart to validateDiagramReferences, above, used by the
 * repository's save() (PATCH) specifically rather than that hard rejection:
 * instead of failing the whole save when a diagram edge references a screen
 * that is not (or no longer) on that same page, drops just those edges and
 * keeps everything else untouched. A dangling screenId reference here is a
 * routine, expected side effect of ordinary editing - deleting a screen, or
 * moving one to another page - that the client is also expected to clean up
 * itself in the same patch (see lib/diagram/store.ts's pruneEdgesForScreen
 * and its callers in components/workbench/workbench.tsx), not a sign of a
 * malformed payload: this is a backstop for whatever reaches here anyway
 * (data saved before that client-side fix existed, or any other gap), since
 * lib/persistence.ts's saver never retries a non-409/5xx response - a hard
 * reject here would wedge the file, repeating the exact same 400 on every
 * future autosave with no way for the user to recover short of reloading
 * and losing every change since the last good save. create() still uses
 * validateDiagramReferences as a hard rejection: a brand new file has no
 * autosave history to wedge, so there is nothing to protect by being
 * lenient there instead.
 */
export function dropDanglingDiagramEdges(pages: readonly Page[], screens: readonly Screen[]): Page[] {
  const screenIdsByPage = new Map<string, Set<string>>();
  for (const screen of screens) {
    if (!screen.pageId) continue;
    const set = screenIdsByPage.get(screen.pageId) ?? new Set<string>();
    set.add(screen.id);
    screenIdsByPage.set(screen.pageId, set);
  }

  return pages.map((page) => {
    if (!page.diagram) return page;
    const screenIds = screenIdsByPage.get(page.id) ?? new Set<string>();
    const edges = page.diagram.edges.filter((edge) => {
      const dangling = [edge.source, edge.target].some(
        (endpoint) => endpoint.screenId && !screenIds.has(endpoint.screenId),
      );
      if (dangling) {
        console.warn(
          `Dropping diagram edge "${edge.id}" on page "${page.name}": it references a screen that is not on this page.`,
        );
      }
      return !dangling;
    });
    return edges.length === page.diagram.edges.length ? page : { ...page, diagram: { nodes: page.diagram.nodes, edges } };
  });
}
