// Pure coordinate maths shared by the comment pins, the composer popover and
// the thread popover. Kept isolated from any DOM measurement so it works the
// same whether `artboardRect` comes from a same-document `getBoundingClientRect()`
// (today, the artboard renders inline) or, later, from measuring the iframe
// element that replaces it (docs/superpowers/specs/2026-09-12-responsive-canvas-design.md):
// the move only changes how `artboardRect` is obtained, never this module.

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
