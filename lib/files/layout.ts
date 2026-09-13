import type { Screen } from './validate';

// The gap, in canvas px, left between one frame's right edge and the next
// frame's left edge when a screen has no saved position yet (spec
// docs/superpowers/specs/2026-09-12-infinite-canvas-design.md section 5) -
// also what components/workbench/workbench.tsx's addScreen uses to place a
// brand new screen to the right of the last frame.
export const FRAME_GAP = 200;

/**
 * Fills in `x`/`y` for every screen that is missing a position (both null,
 * or - defensively - only one of the two set, which validateScreens would
 * reject as saved data but a caller building screens in memory should not
 * have to guarantee before calling this), left to right in array order.
 *
 * Each such screen is placed `FRAME_GAP` px to the right of the PREVIOUS
 * screen's own right edge (that previous screen's already-resolved
 * position - whether it came in with one or was just computed by an earlier
 * iteration of this same loop) at the same y; the very first screen, with no
 * previous frame to chain off, lands at the origin. A screen that already
 * has both x and y is returned unchanged.
 *
 * Pure and non-mutating: returns a new array, never touches its input.
 */
export function layoutMissingPositions(screens: readonly Screen[]): Screen[] {
  const result: Screen[] = [];
  for (const screen of screens) {
    if (screen.x != null && screen.y != null) {
      result.push(screen);
      continue;
    }
    const previous = result[result.length - 1];
    const x = previous ? (previous.x ?? 0) + previous.stageWidth + FRAME_GAP : 0;
    const y = previous ? (previous.y ?? 0) : 0;
    result.push({ ...screen, x, y });
  }
  return result;
}
