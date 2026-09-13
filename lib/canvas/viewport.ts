// Pure canvas viewport maths (spec docs/superpowers/specs/2026-09-12-infinite-canvas-design.md
// section 5): the infinite canvas renders one transformed layer,
// `transform: translate(viewport.x, viewport.y) scale(viewport.zoom)` with
// `transform-origin: 0 0`. For a point in that layer's own (canvas-space,
// unscaled) coordinates, the browser paints it on screen at
// `point * zoom + (viewport.x, viewport.y)` - every function below is a
// direct consequence of that one equation. Kept free of any DOM read so it
// is exhaustively unit-testable; components/workbench/canvas.tsx is the only
// caller that touches the DOM.

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

// A frame (screen) positioned on the canvas, in canvas-space (unscaled) px -
// the same shape a Screen's own x/y/stageWidth/stageHeight naturally give.
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

// The step table for Cmd+=/Cmd+- and the zoom menu (spec section 3), as
// fractions rather than percentages so every consumer can multiply straight
// into a Viewport's own zoom without a /100 conversion at every call site.
export const ZOOM_STEPS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export type ZoomDirection = 'in' | 'out';

// Floating point tolerance for comparing a live zoom value (the product of
// however many zoomAround calls a pinch gesture produced) against the clean
// ZOOM_STEPS constants - without it, a zoom that is already exactly a step
// (e.g. 1, reached by Cmd+0) could fail a strict `>`/`<` comparison against
// itself due to accumulated float drift and skip a step.
const EPSILON = 1e-9;

/**
 * The next step at or after (direction 'in') or at or before (direction
 * 'out') the current zoom, clamped to the ends of the table - Cmd+=/Cmd+-
 * never runs off either end.
 */
export function nextZoomStep(zoom: number, direction: ZoomDirection): number {
  if (direction === 'in') {
    for (const step of ZOOM_STEPS) {
      if (step > zoom + EPSILON) return step;
    }
    return ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < zoom - EPSILON) return ZOOM_STEPS[i];
  }
  return ZOOM_STEPS[0];
}

/** Panning by a screen-space delta is a direct translation of the viewport. */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

/** canvas-space point -> window/screen point, given the current viewport. */
export function toWindowPoint(point: Point, viewport: Viewport): Point {
  return { x: point.x * viewport.zoom + viewport.x, y: point.y * viewport.zoom + viewport.y };
}

/** window/screen point -> canvas-space point - the inverse of toWindowPoint. */
export function toCanvasPoint(point: Point, viewport: Viewport): Point {
  return { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom };
}

/**
 * Multiplies the viewport's zoom by `factor` (clamped to [MIN_ZOOM,
 * MAX_ZOOM]) while keeping `point` (a window/screen point, e.g. the pointer
 * position) visually fixed - the canvas-space location under the pointer
 * before the change is still under the pointer after it. `scale` is derived
 * from the ACTUAL post-clamp zoom change (not the raw `factor`), so this
 * stays correct - and a no-op - once already sitting at MIN_ZOOM/MAX_ZOOM.
 */
export function zoomAround(viewport: Viewport, point: Point, factor: number): Viewport {
  const zoom = clampZoom(viewport.zoom * factor);
  const scale = zoom / viewport.zoom;
  return {
    zoom,
    x: point.x - (point.x - viewport.x) * scale,
    y: point.y - (point.y - viewport.y) * scale,
  };
}

/**
 * Sets the viewport to an exact target zoom (rather than a multiplicative
 * factor - see zoomAround), keeping `point` fixed. The shared engine behind
 * Cmd+0 (target 1), the zoom menu's fixed percentages, and stepZoom below.
 */
export function zoomTo(viewport: Viewport, point: Point, targetZoom: number): Viewport {
  return zoomAround(viewport, point, targetZoom / viewport.zoom);
}

/**
 * Moves the viewport's zoom to the next step in ZOOM_STEPS (Cmd+=/Cmd+-),
 * keeping `point` fixed - typically the viewport centre for a keyboard
 * shortcut, since there is no pointer position to anchor to the way a wheel
 * gesture has one.
 */
export function stepZoom(viewport: Viewport, point: Point, direction: ZoomDirection): Viewport {
  return zoomTo(viewport, point, nextZoomStep(viewport.zoom, direction));
}

/**
 * The viewport that centers `rect` (canvas-space) within `viewportSize`
 * (the visible window/canvas area, in screen px) with `padding` screen px of
 * breathing room on every side, at the largest zoom that still fits both
 * axes - the shared engine behind `zoomToRect`'s two callers, Shift+1 (fit
 * all) and Shift+2 (fit selection/focused frame).
 */
export function zoomToRect(rect: FrameRect, viewportSize: Size, padding = 0): Viewport {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const availableWidth = Math.max(1, viewportSize.width - padding * 2);
  const availableHeight = Math.max(1, viewportSize.height - padding * 2);
  const zoom = clampZoom(Math.min(availableWidth / width, availableHeight / height));
  const centerX = rect.x + width / 2;
  const centerY = rect.y + height / 2;
  return {
    zoom,
    x: viewportSize.width / 2 - centerX * zoom,
    y: viewportSize.height / 2 - centerY * zoom,
  };
}

// Screen-px padding fitAll leaves around the union of every frame, so the
// outermost frames never sit flush against the window edge.
const FIT_ALL_PADDING = 80;

/**
 * The viewport that fits every frame's bounding box on screen at once
 * (Shift+1 / the zoom menu's "Zoom to fit"). Falls back to zoom 1 centered
 * on the viewport when there are no frames (an empty file mid-load).
 */
export function fitAll(frames: readonly FrameRect[], viewportSize: Size): Viewport {
  if (frames.length === 0) {
    return { x: viewportSize.width / 2, y: viewportSize.height / 2, zoom: 1 };
  }
  const minX = Math.min(...frames.map((frame) => frame.x));
  const minY = Math.min(...frames.map((frame) => frame.y));
  const maxX = Math.max(...frames.map((frame) => frame.x + frame.width));
  const maxY = Math.max(...frames.map((frame) => frame.y + frame.height));
  return zoomToRect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, viewportSize, FIT_ALL_PADDING);
}
