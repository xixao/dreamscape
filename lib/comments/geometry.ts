// Pure coordinate maths shared by the comment pins, the composer popover and
// the thread popover. Kept isolated from any DOM measurement so it works the
// same whether `artboardRect` comes from a same-document `getBoundingClientRect()`
// (today, the artboard renders inline) or, later, from measuring the iframe
// element that replaces it (docs/superpowers/specs/2026-09-12-responsive-canvas-design.md):
// the move only changes how `artboardRect` is obtained, never this module.
//
// frameToWindowPoint/windowToFramePoint (below) are the infinite canvas's
// own addition (spec docs/superpowers/specs/2026-09-12-infinite-canvas-
// design.md section 7): the pure-math equivalent of toScreenPoint/
// toArtboardPoint above, but starting from a frame's own canvas-space
// position and the shared viewport instead of a measured DOM rect - useful
// wherever a frame-relative point needs converting without anything to
// measure (or as a cross-check against the DOM-measured path CommentLayer
// and Stage use live).

import { toCanvasPoint, toWindowPoint, type Viewport } from '@/lib/canvas/viewport';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Converts a pointer event's real (post-zoom) client coordinates into
 * artboard-local, unzoomed coordinates - the same coordinate space the
 * artboard's own `width`/`height` are expressed in. This is what a click
 * handler calls to work out where on the (logical) artboard the user
 * pointed, regardless of the current zoom level.
 */
export function toArtboardPoint(
  clientX: number,
  clientY: number,
  artboardRect: Rect,
  zoom: number,
): Point {
  return {
    x: (clientX - artboardRect.left) / zoom,
    y: (clientY - artboardRect.top) / zoom,
  };
}

/**
 * The inverse of `toArtboardPoint`: converts artboard-local, unzoomed
 * coordinates (as stored on a comment thread) into real client/viewport
 * coordinates, for anchoring a pin or a popover on screen.
 */
export function toScreenPoint(x: number, y: number, artboardRect: Rect, zoom: number): Point {
  return {
    x: artboardRect.left + x * zoom,
    y: artboardRect.top + y * zoom,
  };
}

/**
 * A frame-relative point (the same coordinate space a comment thread's own
 * x/y are stored in) to a window point, given the frame's own canvas-space
 * position and the current viewport - frame position, then the viewport's
 * pan and zoom, exactly the chain spec section 7 describes. Equivalent to
 * `toScreenPoint` but derived from the frame's stored position instead of a
 * measured DOM rect.
 */
export function frameToWindowPoint(point: Point, frame: Point, viewport: Viewport): Point {
  return toWindowPoint({ x: frame.x + point.x, y: frame.y + point.y }, viewport);
}

/** The inverse of `frameToWindowPoint`. */
export function windowToFramePoint(point: Point, frame: Point, viewport: Viewport): Point {
  const canvasPoint = toCanvasPoint(point, viewport);
  return { x: canvasPoint.x - frame.x, y: canvasPoint.y - frame.y };
}
