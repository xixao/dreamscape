import type { Box, Point } from './geometry';

/** Find the nearest clear top-left position, optionally confined to the visible canvas. */
function nearestPosition(size: { width: number; height: number }, target: Point, obstacles: readonly Box[], gap: number, area?: Box): Point | null {
  const minX = area?.x ?? -Infinity;
  const maxX = area ? area.x + area.width - size.width : Infinity;
  const minY = area?.y ?? -Infinity;
  const maxY = area ? area.y + area.height - size.height : Infinity;
  if (minX > maxX || minY > maxY) return null;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  // A closest solution lies at the desired x or at an obstacle boundary.
  const xs = new Set([clamp(target.x, minX, maxX), ...obstacles.flatMap(box => [
    clamp(box.x - gap - size.width, minX, maxX), clamp(box.x + box.width + gap, minX, maxX),
  ])]);
  let best: Point | null = null;
  let distance = Infinity;
  for (const x of xs) {
    // Project the occupied rectangles into forbidden intervals for the node's top edge.
    const blocked = obstacles.filter(box => x < box.x + box.width + gap && x + size.width > box.x - gap)
      .map(box => ({ start: box.y - gap - size.height, end: box.y + box.height + gap }))
      .sort((a, b) => a.start - b.start);
    function consider(low: number, high: number) {
      if (low > high) return;
      const y = clamp(target.y, low, high);
      const score = (x - target.x) ** 2 + (y - target.y) ** 2;
      if (score < distance) { distance = score; best = { x, y }; }
    }
    let low = minY;
    for (const interval of blocked) {
      if (interval.end <= low) continue;
      if (interval.start > maxY) break;
      if (interval.start >= low) consider(low, Math.min(interval.start, maxY));
      low = Math.max(low, interval.end);
      if (low > maxY) break;
    }
    consider(low, maxY);
  }
  return best;
}

/** Prefer visible empty canvas; if none fits, reveal the nearest empty spot by panning. */
export function placeDiagramShape(size: { width: number; height: number }, visible: Box, obstacles: readonly Box[], gap: number): { position: Point; reveal: boolean } {
  const target = { x: visible.x + (visible.width - size.width) / 2, y: visible.y + (visible.height - size.height) / 2 };
  const position = nearestPosition(size, target, obstacles, gap, visible);
  if (position) return { position, reveal: false };
  return { position: nearestPosition(size, target, obstacles, gap)!, reveal: true };
}
