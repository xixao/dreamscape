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
 * Each such screen is placed `FRAME_GAP` px to the right of the RIGHTMOST
 * edge among every ALREADY-positioned screen in the whole array (`max(x +
 * stageWidth)`), not merely the previous array element - a screen inserted
 * next to one particular frame (duplicateScreen splices the copy in right
 * after its source; addScreen appends to the end) is not necessarily next
 * to the rightmost one, and chaining off "whichever screen happens to sit
 * right before it in the array" used to place it exactly on top of a
 * frame further right instead. When there is no positioned screen at all,
 * this starting edge is the origin. Several unpositioned screens in the
 * same call continue chaining off each other, left to right, from that
 * same starting point, so the whole batch never overlaps anything -
 * neither each other nor any already-positioned frame. Each one's `y`
 * chains off the previous RESOLVED screen in array order (its already-
 * given position, or the one just computed for it a moment ago), or 0 for
 * the very first screen with nothing to chain off - the same rule this
 * function has always used for y, since two frames sharing a row is not an
 * overlap concern the way x is. A screen that already has both x and y is
 * returned unchanged.
 *
 * Pure and non-mutating: returns a new array, never touches its input.
 */
export function layoutMissingPositions(screens: readonly Screen[]): Screen[] {
  const positioned = screens.filter((screen) => screen.x != null && screen.y != null);
  let cursorX =
    positioned.length > 0 ? Math.max(...positioned.map((screen) => (screen.x ?? 0) + screen.stageWidth)) + FRAME_GAP : 0;

  const result: Screen[] = [];
  for (const screen of screens) {
    if (screen.x != null && screen.y != null) {
      result.push(screen);
      continue;
    }
    const previous = result[result.length - 1];
    const x = cursorX;
    const y = previous ? (previous.y ?? 0) : 0;
    result.push({ ...screen, x, y });
    cursorX = x + screen.stageWidth + FRAME_GAP;
  }
  return result;
}
