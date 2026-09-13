import { breakpointForWidth } from '@/lib/responsive';

// The canonical size range for a frame - re-exported through lib/stage.ts
// (clampWidth/MIN_STAGE_WIDTH/MAX_STAGE_WIDTH) so every consumer, old and
// new, reads the same numbers from one source of truth.
export const MIN_STAGE_WIDTH = 120;
export const MAX_STAGE_WIDTH = 3840;
export const MIN_STAGE_HEIGHT = 120;
export const MAX_STAGE_HEIGHT = 8192;

export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_STAGE_WIDTH;
  return Math.min(MAX_STAGE_WIDTH, Math.max(MIN_STAGE_WIDTH, Math.round(width)));
}

export function clampHeight(height: number): number {
  if (!Number.isFinite(height)) return MIN_STAGE_HEIGHT;
  return Math.min(MAX_STAGE_HEIGHT, Math.max(MIN_STAGE_HEIGHT, Math.round(height)));
}

export type StageSize = { width: number; height: number | null };

/**
 * Clamps a frame size into range. `height: null` means auto (the frame
 * grows with its content) and passes through untouched - only a numeric
 * height is clamped to [MIN_STAGE_HEIGHT, MAX_STAGE_HEIGHT].
 */
export function clampSize({ width, height }: StageSize): StageSize {
  return { width: clampWidth(width), height: height == null ? null : clampHeight(height) };
}

/**
 * The stage-width readout text shown in the top bar and beside an active
 * resize handle while dragging. Three forms, matching the spec
 * (docs/superpowers/specs/2026-09-12-responsive-canvas-design.md #1):
 *   - a device:            "<device name> · <width> × <height>"
 *   - a manual fixed size: "<width> × <height>" (no breakpoint - the exact
 *     dimensions already say more than "desktop" would)
 *   - auto height:         "<width> px · <breakpoint>"
 * Any form appends " · <zoom>%" - always, at any zoom including exactly
 * 100% and above, now that zoom is a user-controlled canvas viewport
 * (docs/superpowers/specs/2026-09-12-infinite-canvas-design.md) rather than
 * a fit-to-column value that was 100% only incidentally.
 */
export function readoutFor({
  width,
  height,
  deviceName,
  zoom,
}: {
  width: number;
  height: number | null;
  deviceName: string | null;
  zoom: number;
}): string {
  const parts: string[] =
    deviceName && height != null
      ? [deviceName, `${width} × ${height}`]
      : height != null
        ? [`${width} × ${height}`]
        : [`${width} px`, breakpointForWidth(width)];
  parts.push(`${Math.round(zoom * 100)}%`);
  return parts.join(' · ');
}
