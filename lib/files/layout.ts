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
 * have to guarantee before calling this), left to right in array order -
 * independently PER PAGE (Screen.pageId, migration 0003): each page is its
 * own infinite canvas, never rendered alongside another page's frames, so
 * a screen's x/y only ever needs to avoid overlapping other screens on the
 * SAME page. A screen with no pageId at all (an older in-memory value that
 * has not been stamped yet) is grouped with every other such screen, same
 * as any other shared pageId value - it is never a real, mixed case by the
 * time this runs on saved data.
 *
 * Within one page, each unpositioned screen is placed `FRAME_GAP` px to
 * the right of the RIGHTMOST edge among every ALREADY-positioned screen on
 * that same page (`max(x + stageWidth)`), not merely the previous array
 * element - a screen inserted next to one particular frame (duplicateScreen
 * splices the copy in right after its source; addScreen appends to the
 * end) is not necessarily next to the rightmost one, and chaining off
 * "whichever screen happens to sit right before it in the array" used to
 * place it exactly on top of a frame further right instead. When a page has
 * no positioned screen at all yet, this starting edge is that page's own
 * origin. Several unpositioned screens on the same page, in the same call,
 * continue chaining off each other, left to right, from that same starting
 * point, so the whole batch never overlaps anything - neither each other
 * nor any already-positioned frame on that page. Each one's `y` chains off
 * the previous RESOLVED screen ON THE SAME PAGE in array order (its
 * already-given position, or the one just computed for it a moment ago), or
 * 0 when nothing on that page has been resolved yet - the same rule this
 * function has always used for y, since two frames sharing a row is not an
 * overlap concern the way x is. A screen that already has both x and y is
 * returned unchanged.
 *
 * Pure and non-mutating: returns a new array, never touches its input.
 */
export function layoutMissingPositions(screens: readonly Screen[]): Screen[] {
  // undefined is a valid Map key, so a missing pageId simply becomes its
  // own group - see the doc comment above.
  const cursorXByPage = new Map<string | undefined, number>();
  const lastYByPage = new Map<string | undefined, number>();

  function cursorFor(pageId: string | undefined): number {
    const cached = cursorXByPage.get(pageId);
    if (cached !== undefined) return cached;
    const positioned = screens.filter(
      (screen) => screen.pageId === pageId && screen.x != null && screen.y != null,
    );
    const cursor =
      positioned.length > 0
        ? Math.max(...positioned.map((screen) => (screen.x ?? 0) + screen.stageWidth)) + FRAME_GAP
        : 0;
    cursorXByPage.set(pageId, cursor);
    return cursor;
  }

  const result: Screen[] = [];
  for (const screen of screens) {
    if (screen.x != null && screen.y != null) {
      result.push(screen);
      lastYByPage.set(screen.pageId, screen.y);
      continue;
    }
    const x = cursorFor(screen.pageId);
    const y = lastYByPage.get(screen.pageId) ?? 0;
    result.push({ ...screen, x, y });
    cursorXByPage.set(screen.pageId, x + screen.stageWidth + FRAME_GAP);
    lastYByPage.set(screen.pageId, y);
  }
  return result;
}
