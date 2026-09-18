export type PanSample = { x: number; y: number; time: number };

/** Screen-space throw distance; independent of canvas zoom. */
export function panMomentum(samples: PanSample[], releasedAt: number) {
  const last = samples.at(-1);
  if (!last || releasedAt - last.time > 80) return null;
  const first = samples.find(sample => last.time - sample.time <= 100);
  if (!first || last.time - first.time < 8) return null;
  const elapsed = last.time - first.time;
  const vx = (last.x - first.x) / elapsed, vy = (last.y - first.y) / elapsed;
  const speed = Math.hypot(vx, vy);
  if (!Number.isFinite(speed) || speed < 0.12) return null;
  const scale = Math.min(1, 3 / speed);
  // Cubic ease-out starts at 3 * distance / duration: preserve release speed.
  return { x: vx * scale * 200, y: vy * scale * 200, duration: 600 };
}
