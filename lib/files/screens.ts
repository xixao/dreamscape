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
 * absent `kind` means a plain screen. Checks the presentation is really
 * there too, so the narrowing never lies about unvalidated data (a bare
 * `{ kind: 'overlay' }` is not an overlay frame).
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
