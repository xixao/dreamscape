export interface Bounds { left: number; top: number; right: number; bottom: number }
/** Subtract chrome and the selected element; never choose an overlapping fallback. */
export function placeWriterPopover(view: Bounds, anchor: Bounds, obstacles: Bounds[], height: number): { left: number; top: number; width: number; maxHeight: number; score: number } | null {
  let spaces = [view];
  for (const obstacle of [anchor, ...obstacles]) {
    const o = { left: obstacle.left - 12, top: obstacle.top - 12, right: obstacle.right + 12, bottom: obstacle.bottom + 12 };
    spaces = spaces.flatMap(r => {
      if (o.right <= r.left || o.left >= r.right || o.bottom <= r.top || o.top >= r.bottom) return [r];
      return [
        { ...r, bottom: Math.min(r.bottom, o.top) }, { ...r, top: Math.max(r.top, o.bottom) },
        { ...r, right: Math.min(r.right, o.left) }, { ...r, left: Math.max(r.left, o.right) },
      ].filter(r => r.right - r.left >= 240 && r.bottom - r.top >= 100);
    });
  }
  return spaces.map(r => {
    const width = Math.min(320, r.right - r.left), maxHeight = Math.min(height, r.bottom - r.top);
    const left = Math.max(r.left, Math.min(anchor.left, r.right - width));
    const top = Math.max(r.top, Math.min(anchor.bottom + 12, r.bottom - maxHeight));
    const distance = Math.hypot(left - anchor.left, top - anchor.bottom);
    return { left, top, width, maxHeight, score: distance + (height - maxHeight) * 3 };
  }).sort((a,b) => a.score - b.score)[0] ?? null;
}
