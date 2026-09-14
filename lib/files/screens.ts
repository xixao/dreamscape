import { ROOT_LAYOUT_PROPS, type LayoutBoxProps } from '@/lib/classes';
import type {
  OverlayPresentation,
  OverlayPresentationType,
  OverlaySide,
  Screen,
  ToastPosition,
} from './validate';

// Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
// design.md section 2): the helpers for telling an overlay frame from a
// plain screen and for minting a new one with the spec's defaults. Kept
// next to validate.ts (where Screen and OverlayPresentation live) rather
// than in the repository, and free of any client-only import, so both the
// editor (phase 2's "New overlay" menu) and server code can use it.

// A Screen known to be an overlay frame: `kind` and `presentation` both
// present, which is exactly what validateScreens guarantees for every saved
// overlay (an overlay without a presentation never validates). Narrow with
// isOverlay below and read `presentation` without a guard.
export type OverlayScreen = Screen & { kind: 'overlay'; presentation: OverlayPresentation };

/**
 * True for a screen that is an overlay frame, narrowing it to OverlayScreen;
 * absent `kind` means a plain screen. Deliberately requires the
 * presentation as well as the kind, so the narrowing never lies about
 * unvalidated data: a bare `{ kind: 'overlay' }` with no presentation -
 * unreachable through validateScreens, which rejects it - is NOT an
 * overlay frame and counts as a plain screen everywhere this is used (the
 * Player's own screen list included). Keep it that way; loosening it to
 * `kind` alone would hand every caller an OverlayScreen whose
 * `presentation` can be undefined.
 */
export function isOverlay(screen: Pick<Screen, 'kind' | 'presentation'>): screen is OverlayScreen {
  return screen.kind === 'overlay' && screen.presentation !== undefined;
}

// `stageWidth` is the overlay's own width (its blocks respond to that
// width, not the page's). Top/bottom sheets ignore it in Play and span the
// viewport; it still seeds the frame on the canvas.
export const OVERLAY_DEFAULT_WIDTHS: Record<OverlayPresentationType, number> = {
  dialog: 512,
  sheet: 400,
  toast: 360,
};

// The artboard minimum height for an overlay that hugs its content
// (`stageHeight` null) - not lib/stage.ts's ARTBOARD_MIN_HEIGHT, which is
// sized for a whole screen.
export const OVERLAY_MIN_HEIGHT = 120;

// The base of a new overlay's name ("Dialog 2", "Sheet 1", ...): numbering
// per file is the caller's job, same as it is for a new screen's "Frame N".
export const OVERLAY_DEFAULT_NAMES: Record<OverlayPresentationType, string> = {
  dialog: 'Dialog',
  sheet: 'Sheet',
  toast: 'Toast',
};

/**
 * The mono badge shown after an overlay frame's name (spec section 5): the
 * Frames chip's rows and the canvas frame title both render exactly this
 * string, so the two can never drift apart from one another. A dialog or
 * toast badge names only the type ("Dialog", "Toast"); a sheet also names
 * its side ("Sheet · Right") since, unlike a dialog or toast, a sheet's
 * presentation differs visibly by side. Same switch-with-no-default shape
 * as defaultPresentation below, for the same reason: a fourth presentation
 * type added to the union fails this file's own build (not every code path
 * returns a value) until it gets a branch here too.
 */
export function overlayBadgeLabel(presentation: OverlayPresentation): string {
  switch (presentation.type) {
    case 'dialog':
      return 'Dialog';
    case 'sheet':
      return `Sheet · ${presentation.side[0].toUpperCase()}${presentation.side.slice(1)}`;
    case 'toast':
      return 'Toast';
  }
}

/**
 * True when `name` is exactly "<the type's default prefix> <a number>" -
 * "Dialog 2", not "Dialog" or "My Dialog 2" or a different type's prefix.
 * Used to decide whether switching an overlay's presentation type (the
 * Design panel's Overlay section) should also rename it: only when the
 * name still looks untouched from whenever it was created or last
 * switched, never when the user has given it a real name of their own
 * (phase 2 review finding 2/3's "keep the user's name" requirement).
 */
export function isDefaultOverlayName(name: string, type: OverlayPresentationType): boolean {
  return new RegExp(`^${OVERLAY_DEFAULT_NAMES[type]} \\d+$`).test(name);
}

/**
 * The next unused "<Type> N" default name for `type`, scanning existing
 * OVERLAY names only (never a plain screen's, even one that happens to
 * look like a default) for the highest N already in use and returning one
 * past it - "Dialog 1" when there is no dialog yet. Counts by NAME, not by
 * how many overlays currently have `presentation.type === type` (phase 2
 * review finding 2): an overlay renamed away from its default no longer
 * reserves its number, and switching an EXISTING overlay's type without
 * renaming it (see isDefaultOverlayName above) does not, on its own, free
 * up or claim any number either - only the name on screen ever matters
 * here, exactly like `addScreen`'s own "Frame N" would need to work if
 * screens could be renamed away and back. Shared by addOverlay (a brand
 * new overlay) and the Design panel's presentation-type switch (an
 * existing one, renamed only when its old name was still a default).
 */
export function nextOverlayDefaultName(screens: readonly Pick<Screen, 'name' | 'kind' | 'presentation'>[], type: OverlayPresentationType): string {
  const prefix = OVERLAY_DEFAULT_NAMES[type];
  const pattern = new RegExp(`^${prefix} (\\d+)$`);
  let highest = 0;
  for (const screen of screens) {
    if (!isOverlay(screen)) continue;
    const match = pattern.exec(screen.name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix} ${highest + 1}`;
}

/**
 * True when removing `screen` from `pageScreens` (that same screen's own
 * page - Delete or Move to page, both in components/workbench/frames-
 * chip.tsx, and the matching guards in components/workbench/workbench.tsx's
 * deleteScreen/moveScreenToPage) would leave the page with an overlay but
 * no plain screen left (phase 2 review finding 1: Present has nowhere
 * sensible to land on a page like that). Always false for an overlay
 * itself - only removing a PLAIN screen can strand a page this way - and
 * always false when the page has no overlay at all, so a page with
 * nothing but plain screens keeps its pre-existing behavior unchanged
 * (deleting the last screen of any kind, or emptying a page entirely via
 * Move to page, both stay governed by whatever rule already covered them).
 * The one shared source both the Frames chip's disabled-with-tooltip UI
 * and the data-layer guards call, so the two can never disagree about
 * which row is blocked.
 */
export function wouldStrandPage(
  screen: Pick<Screen, 'id' | 'kind' | 'presentation'>,
  pageScreens: readonly Pick<Screen, 'id' | 'kind' | 'presentation'>[],
): boolean {
  if (isOverlay(screen)) return false;
  const remainingPlain = pageScreens.filter((candidate) => candidate.id !== screen.id && !isOverlay(candidate));
  const hasOverlay = pageScreens.some((candidate) => isOverlay(candidate));
  return remainingPlain.length === 0 && hasOverlay;
}

const OVERLAY_GAP_PX = 16;
const OVERLAY_PADDING_PX: Record<OverlayPresentationType, LayoutBoxProps['paddingPx']> = {
  dialog: 24,
  sheet: 24,
  toast: 16,
};

function defaultPresentation({
  type,
  side,
  position,
}: {
  type: OverlayPresentationType;
  side?: OverlaySide;
  position?: ToastPosition;
}): OverlayPresentation {
  switch (type) {
    case 'dialog':
      return { type: 'dialog', dismissible: true };
    case 'sheet':
      return { type: 'sheet', side: side ?? 'right', dismissible: true };
    case 'toast':
      return { type: 'toast', position: position ?? 'bottom-right' };
  }
}

// A lone ROOT LayoutBox in column flex, shaped exactly like
// lib/examples/login-screen.json's ROOT (the same serialized node keys, in
// the same order, so a new overlay's layout looks like every other saved
// layout): stretch-aligned, 16 px gap, and the presentation's padding - a
// toast is tighter than a dialog or sheet. The Play wrappers use `p-0`, so
// this padding IS the overlay's padding (spec section 4).
function overlayLayoutJson(type: OverlayPresentationType): string {
  const props: LayoutBoxProps = {
    ...ROOT_LAYOUT_PROPS,
    gapPx: OVERLAY_GAP_PX,
    paddingPx: OVERLAY_PADDING_PX[type],
  };
  return JSON.stringify({
    ROOT: {
      type: { resolvedName: 'LayoutBox' },
      isCanvas: true,
      props,
      displayName: 'Frame',
      custom: {},
      parent: null,
      hidden: false,
      nodes: [],
      linkedNodes: {},
    },
  });
}

/**
 * Mints a new overlay frame with the spec's defaults for its type: a
 * dismissible dialog at 512 wide, a dismissible sheet on the right (or the
 * given side) at 400 wide, or a toast at the bottom right (or the given
 * position) at 360 wide - always hugging its content (`stageHeight` null)
 * with no device (device presets do not apply to overlays), on the given
 * page at the given canvas position. A `side` on anything but a sheet, or
 * a `position` on anything but a toast, is ignored: the presentation only
 * ever carries the keys its type has (validate.ts's validatePresentation
 * would reject anything else). The id and name are the caller's (a fresh
 * nanoid(10), and "Dialog"/"Sheet"/"Toast" numbered per file - see
 * OVERLAY_DEFAULT_NAMES).
 */
export function createOverlayScreen({
  type,
  side,
  position,
  id,
  name,
  pageId,
  x,
  y,
}: {
  type: OverlayPresentationType;
  side?: OverlaySide;
  position?: ToastPosition;
  id: string;
  name: string;
  pageId: string;
  x: number;
  y: number;
}): Screen {
  return {
    id,
    name,
    layout: overlayLayoutJson(type),
    stageWidth: OVERLAY_DEFAULT_WIDTHS[type],
    stageHeight: null,
    deviceName: null,
    x,
    y,
    pageId,
    kind: 'overlay',
    presentation: defaultPresentation({ type, side, position }),
  };
}
