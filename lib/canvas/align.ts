// Pure frame alignment/distribution maths for a canvas selection of two or
// more frames (spec docs/superpowers/specs/2026-09-13-grid-snapping-
// alignment-design.md section 4): align left/centre/right/top/middle/
// bottom, distribute with equal gaps, and tidy up into a single row.
// Rendered by components/workbench/inspector/alignment-fields.tsx; the
// results are canvas-space integer px, matching the `x`/`y` contract
// lib/files/validate.ts's validateScreens enforces on every screen.

import { FRAME_GAP } from '@/lib/files/layout';

export interface AlignableFrame {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FramePosition {
  id: string;
  x: number;
  y: number;
}

function bounds(frames: readonly AlignableFrame[]): { left: number; right: number; top: number; bottom: number } {
  return {
    left: Math.min(...frames.map((frame) => frame.x)),
    right: Math.max(...frames.map((frame) => frame.x + frame.width)),
    top: Math.min(...frames.map((frame) => frame.y)),
    bottom: Math.max(...frames.map((frame) => frame.y + frame.height)),
  };
}

export function alignLeft(frames: readonly AlignableFrame[]): FramePosition[] {
  const { left } = bounds(frames);
  return frames.map((frame) => ({ id: frame.id, x: Math.round(left), y: Math.round(frame.y) }));
}

export function alignRight(frames: readonly AlignableFrame[]): FramePosition[] {
  const { right } = bounds(frames);
  return frames.map((frame) => ({ id: frame.id, x: Math.round(right - frame.width), y: Math.round(frame.y) }));
}

export function alignHorizontalCenters(frames: readonly AlignableFrame[]): FramePosition[] {
  const { left, right } = bounds(frames);
  const center = (left + right) / 2;
  return frames.map((frame) => ({ id: frame.id, x: Math.round(center - frame.width / 2), y: Math.round(frame.y) }));
}

export function alignTop(frames: readonly AlignableFrame[]): FramePosition[] {
  const { top } = bounds(frames);
  return frames.map((frame) => ({ id: frame.id, x: Math.round(frame.x), y: Math.round(top) }));
}

export function alignBottom(frames: readonly AlignableFrame[]): FramePosition[] {
  const { bottom } = bounds(frames);
  return frames.map((frame) => ({ id: frame.id, x: Math.round(frame.x), y: Math.round(bottom - frame.height) }));
}

export function alignVerticalMiddles(frames: readonly AlignableFrame[]): FramePosition[] {
  const { top, bottom } = bounds(frames);
  const center = (top + bottom) / 2;
  return frames.map((frame) => ({ id: frame.id, x: Math.round(frame.x), y: Math.round(center - frame.height / 2) }));
}

interface DistributeAxis {
  start: (frame: AlignableFrame) => number;
  size: (frame: AlignableFrame) => number;
  // Builds the final rounded position for one frame, given its new,
  // already-rounded coordinate on THIS axis - the other axis passes
  // through unchanged (still rounded, in case a caller ever hands in
  // fractional input).
  write: (frame: AlignableFrame, value: number) => FramePosition;
}

const X_AXIS: DistributeAxis = {
  start: (frame) => frame.x,
  size: (frame) => frame.width,
  write: (frame, value) => ({ id: frame.id, x: value, y: Math.round(frame.y) }),
};

const Y_AXIS: DistributeAxis = {
  start: (frame) => frame.y,
  size: (frame) => frame.height,
  write: (frame, value) => ({ id: frame.id, x: Math.round(frame.x), y: value }),
};

/**
 * Spaces the gaps between every frame evenly along one axis, keeping the
 * outermost two frames (by their current position) exactly where they are -
 * Figma's own "distribute spacing" behaviour. A no-op (rounded positions
 * only) below three frames: with only two, there is a single gap and
 * nothing to equalize against.
 */
function distribute(frames: readonly AlignableFrame[], axis: DistributeAxis): FramePosition[] {
  if (frames.length < 3) {
    return frames.map((frame) => ({ id: frame.id, x: Math.round(frame.x), y: Math.round(frame.y) }));
  }
  const sorted = [...frames].sort((a, b) => axis.start(a) - axis.start(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = axis.start(last) + axis.size(last) - axis.start(first);
  const totalSize = sorted.reduce((sum, frame) => sum + axis.size(frame), 0);
  const gap = (span - totalSize) / (sorted.length - 1);

  // The running cursor stays unrounded between steps (only each frame's own
  // OUTPUT position is rounded) so per-frame rounding never accumulates
  // into visible drift across a long row.
  let cursor = axis.start(first);
  return sorted.map((frame) => {
    const position = axis.write(frame, Math.round(cursor));
    cursor += axis.size(frame) + gap;
    return position;
  });
}

export function distributeHorizontally(frames: readonly AlignableFrame[]): FramePosition[] {
  return distribute(frames, X_AXIS);
}

export function distributeVertically(frames: readonly AlignableFrame[]): FramePosition[] {
  return distribute(frames, Y_AXIS);
}

/**
 * Lays every frame out in a single row, in current x order, with `gap` px
 * (the same FRAME_GAP a new or duplicated screen already places itself by)
 * between each one - spec section 4: "a row with 200 px gaps in current x
 * order". The leftmost frame's own x/y anchors the row; every other frame
 * lands on that same y.
 */
export function tidyUp(frames: readonly AlignableFrame[], gap: number = FRAME_GAP): FramePosition[] {
  if (frames.length === 0) return [];
  const sorted = [...frames].sort((a, b) => a.x - b.x);
  const rowY = Math.round(sorted[0].y);
  let cursor = sorted[0].x;
  return sorted.map((frame) => {
    const position = { id: frame.id, x: Math.round(cursor), y: rowY };
    cursor += frame.width + gap;
    return position;
  });
}
