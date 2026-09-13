// Pure helpers for the make-room drag placeholder (docs/superpowers/specs/
// 2026-09-12-drop-placeholder-design.md). Kept free of any @craftjs/core or
// DOM import - same rationale as lib/layer-stack.ts's own stackUnder: the
// caller (components/workbench/drop-placeholder.tsx) flattens whatever
// shape Craft's live indicator/DOM measurements happen to have into the
// small, framework-agnostic shapes below, so this module is unit-testable
// without rendering inside a live Editor.

/** The subset of Craft's `Placement` this module needs (interfaces/events.d.ts's `DropPosition`, loosened: `where` is `string` there too - Craft's own Positioner only ever produces "before"/"after", but never narrows the type). */
export interface InsertionPlacement {
  index: number;
  where: string;
}

/**
 * The DOM index to `insertBefore` the placeholder at, within the parent's
 * current (real, Craft-tracked) children: `placement.index` unchanged for
 * "before", one past it for "after" - the same rule Craft's own dragend
 * handler already uses to turn a placement into a move/insert index (the
 * vendored 0.2.12 bundle's `n.placement.index+("after"===n.placement.where?1:0)`,
 * in both the `drag` and `create` connectors' dragend handlers).
 */
export function insertionIndex(placement: InsertionPlacement): number {
  return placement.index + (placement.where === 'after' ? 1 : 0);
}

export type ContainerDirection = 'row' | 'column' | 'grid';

export interface SizeHint {
  width: number;
  height: number;
}

/** Which element the size hint describes: an existing layer being moved (its own measured box) or a new component from the tray (only a rough previewSize guess, or nothing at all). */
export type PlaceholderKind = 'existing' | 'new';

export interface PlaceholderSize {
  /** A concrete pixel width, or `null` meaning "no explicit width" - the caller renders that as the container's full width/one grid cell, per `direction`. */
  width: number | null;
  /** A concrete pixel height, or `null` meaning "no explicit height" - stretched to the cross axis, or one grid cell, per `direction`. */
  height: number | null;
}

// Spec: "falls back to 40 px tall and the container's full width" - used
// whenever there is no hint at all (a tray item with no previewSize; see
// components/blocks/registry.tsx). Every current tray item has a
// previewSize, so this is a defensive default, not a path any of them
// actually take today.
export const FALLBACK_HEIGHT = 40;

/**
 * The placeholder's size for a given container direction.
 *
 * - `kind: 'existing'` (a layer being moved/reordered): sized EXACTLY like
 *   the dragged element's own measured box, on both axes, regardless of
 *   direction - spec section 2's "it is sized like the dragged element...
 *   a moved layer uses its own measured box". A grid still collapses to one
 *   cell (no explicit size) rather than the measured box, since Craft
 *   itself may resize the returned node into that cell's own track - a
 *   defensive request from the spec's unconditional "in a grid it takes
 *   one cell".
 * - `kind: 'new'` (a tray component): only a rough guess exists
 *   (`previewSize`, or nothing) - the main-axis dimension is that hint and
 *   the cross axis stretches (returned as `null`) so the slot reads as a
 *   full lane rather than a literal miniature preview; a grid takes one
 *   cell; missing a hint entirely falls back to a flat 40px-tall,
 *   full-width bar (`FALLBACK_HEIGHT`), independent of direction - the
 *   same shape the coloured indicator bar it replaces already drew.
 */
export function placeholderSize(
  kind: PlaceholderKind,
  hint: SizeHint | null,
  direction: ContainerDirection,
): PlaceholderSize {
  if (direction === 'grid') return { width: null, height: null };

  if (kind === 'existing' && hint) {
    return { width: hint.width, height: hint.height };
  }

  if (!hint) return { width: null, height: FALLBACK_HEIGHT };

  return direction === 'row' ? { width: hint.width, height: null } : { width: null, height: hint.height };
}

export interface FlipRect {
  top: number;
  left: number;
}

export interface FlipDelta {
  dx: number;
  dy: number;
}

/**
 * Per-element FLIP deltas (First, Last, Invert, Play): for every id present
 * in BOTH `before` and `after`, the translation that would put it back at
 * its `before` position given it is now laid out at `after` - the inverse
 * transform FLIP applies immediately (with no transition) before animating
 * `transform` to `none`/identity over `TRANSITION_MS`. An id only in one of
 * the two snapshots (newly appeared, or just left the container) has
 * nothing to invert from/to and is omitted - the caller applies no
 * transform to it.
 */
export function flipDeltas(
  before: Record<string, FlipRect>,
  after: Record<string, FlipRect>,
): Record<string, FlipDelta> {
  const deltas: Record<string, FlipDelta> = {};
  for (const [id, afterRect] of Object.entries(after)) {
    const beforeRect = before[id];
    if (!beforeRect) continue;
    deltas[id] = { dx: beforeRect.left - afterRect.left, dy: beforeRect.top - afterRect.top };
  }
  return deltas;
}

// The placeholder's grow-from-zero animation and every sibling's FLIP
// settle transition (spec section 2: "grows... over 150 ms"; "transition
// to none over 150 ms").
export const TRANSITION_MS = 150;

/**
 * `prefers-reduced-motion: reduce` (spec: "disables the transitions and
 * FLIP... the slot still opens, instantly"). Guarded rather than a direct
 * `window.matchMedia(...)` call: jsdom (this repo's test environment) has
 * no `matchMedia` at all unless a test stubs it, and a future non-browser
 * render (SSR) has no `window` either - both should read as "no preference
 * reported," not throw.
 */
export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
