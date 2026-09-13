// Craft's drop-target cache, and why we clear it directly.
//
// @craftjs/core 0.2.12 (the version vendored in node_modules - see
// node_modules/@craftjs/core/dist/esm/index.js, search `key:"onScroll"`)
// keeps a `Positioner` per drag that caches the hovered drop target's child
// rects in `currentTargetChildDimensions`, keyed by `currentTargetId`
// (`getChildDimensions`: `this.currentTargetId===e.id&&n?n:...recompute`).
// The ONLY thing that ever clears that cache is the Positioner's own
// capture-phase `scroll` listener, which its constructor attaches to the
// parent `window` - and even then only when
// `event.target instanceof Element && event.target.contains(rootNode.dom)`.
//
// CanvasFrame (components/workbench/canvas-frame.tsx) renders the artboard
// into its own `<iframe>` document so the frame can be resized like a real
// viewport. A scroll of that frame's own overflow can never satisfy
// Craft's check from outside: dispatching a synthetic `scroll` on the
// parent `window` fails `instanceof Element` (`window` isn't an `Element`
// in any realm), and dispatching one on some parent-document element
// instead would still fail `.contains()`, since the tracked node's `dom`
// lives inside the iframe's document and `Node.contains()` never crosses a
// document boundary. So the cache is never invalidated by an in-frame
// scroll, and while dragging over a fixed-height frame whose content
// overflows, Craft can keep serving stale child rects for the hovered
// container - landing the drop indicator and insert index in the wrong
// place - until the drag leaves it.
//
// The fix is to reach the live Positioner and clear its cache ourselves,
// bypassing `onScroll` entirely. There is no supported path from
// `useEditor()`'s `store`: `EditorStore` is a plain
// `{ getState, subscribe, actions, query, history }` container (see
// `@craftjs/core`'s `lib/editor/store.d.ts`, and confirmed by introspecting
// a live store at runtime - `store.handlers` is `undefined`) with no
// reference back to event handling. The `DefaultEventHandlers` instance
// that owns the Positioner is only reachable through Craft's separate
// `useEventHandler()` hook/context (`lib/events/EventContext.d.ts`,
// populated by the `<Events>` component that `<Editor>` renders around its
// children), and its `positioner` field exists only for the lifetime of an
// active drag (`dragstart` creates it, `dragend` nulls it out).
//
// Every access below is optional-chained: if a future `@craftjs/core`
// upgrade renames or removes `positioner`, `currentTargetChildDimensions`
// or `currentTargetId`, this degrades to a silent no-op instead of a
// runtime error.

/** The subset of Craft's internal `Positioner` this module depends on. */
type PositionerCache = {
  currentTargetChildDimensions: unknown;
  currentTargetId: unknown;
};

/**
 * The subset of Craft's `useEventHandler()` return value this module reads.
 * That hook returns the live `DefaultEventHandlers` instance while one
 * exists, or `null` outside of an `<Editor>` - hence the loose, all-optional
 * shape rather than importing Craft's own (unrelated-looking) type.
 */
export type CraftEventHandlerLike =
  | {
      positioner?: PositionerCache | null;
    }
  | null
  | undefined;

/**
 * Clears Craft's cached drop-target child dimensions, if a drag is
 * currently in progress. Safe to call any time: a no-op when there is no
 * active drag, no live handler (e.g. no `<Editor>` ancestor), or when a
 * future Craft version changes this shape.
 */
export function invalidateDropCache(eventHandler: CraftEventHandlerLike): void {
  const positioner = eventHandler?.positioner;
  if (!positioner) return;
  positioner.currentTargetChildDimensions = null;
  positioner.currentTargetId = null;
}
