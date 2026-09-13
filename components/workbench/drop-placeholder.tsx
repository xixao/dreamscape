'use client';

import { useEditor, useEventHandler, type Indicator } from '@craftjs/core';
import { useEffect, useRef } from 'react';
import { trayItems } from '@/components/blocks/registry';
import { invalidateDropCache, type CraftEventHandlerLike } from '@/lib/craft-positioner';
import { isElementLike } from '@/lib/dom';
import {
  TRANSITION_MS,
  flipDeltas,
  insertionIndex,
  placeholderSize,
  reducedMotion,
  type ContainerDirection,
  type FlipRect,
  type PlaceholderKind,
  type SizeHint,
} from '@/lib/drop-placeholder';
import { useCanvasDocument } from './canvas-frame';

// Marks the plain DOM element this hook inserts - never a Craft node. Also
// what tests query for.
//
// Verified against the vendored 0.2.12 bundle (node_modules/@craftjs/core/
// dist/esm/index.js) that this placeholder cannot confuse Craft's own
// dragover/dragend placement maths, so no fallback (sizing the slot from a
// neighbouring child's margins instead of its own box, as the task brief
// allows for) is needed:
// - `Positioner.getChildDimensions(parent)` - what `dragover`'s
//   `computeIndicator` measures against on every pointer move - builds its
//   list by reducing over `parent.data.nodes` (Craft's OWN ordered child-id
//   array) and looking up each id's `dom` via `store.query.node(id).get()`.
//   It never reads `parentDom.children`/`childNodes`, so a plain DOM node
//   with no Craft id - this placeholder - is structurally invisible to it,
//   regardless of where in the DOM it actually sits.
// - The `drag`/`create` connectors' own `dragend` handlers
//   (`dropElement`) call `actions.move(nodes, placement.parent.id,
//   placement.index + (where === "after" ? 1 : 0))` /
//   `actions.addNodeTree(tree, placement.parent.id, ...)` - again indexing
//   into `parent.data.nodes`, never the real DOM child count. Removing this
//   placeholder before that handler runs (the capture-phase dragend/drop
//   listeners below) is still correct to do - React does not know this
//   manually inserted node exists and would never clean it up itself -
//   just not required for Craft's OWN index math to stay correct.
// - `getChildDimensions` also caches its result per `currentTargetId`,
//   cleared only by a real scroll or lib/craft-positioner.ts's
//   invalidateDropCache - this hook calls the latter itself on every DOM
//   change it makes (open, move, close, collapse, and once more when a
//   FLIP settles), so Craft never keeps serving a stale or mid-animation
//   measurement of the hovered container's children (review finding 2).
const PLACEHOLDER_ATTR = 'data-drop-placeholder';

// component-tray.tsx stamps this on the exact element (each row's drag
// surface) its connectors.create ref lives on, so a raw dragstart on it (or
// a descendant) identifies which TrayItem is being dragged - the only way to
// learn that, since a "new" DragTarget's tree/component is private to
// Craft's own DefaultEventHandlers instance and never reaches `state` at
// all (unlike an "existing" drag, which state.events.dragged exposes
// directly).
const TRAY_ITEM_ATTR = 'data-tray-item';

/** `getComputedStyle`'s `display`/`flexDirection` of a container, reduced to what placeholderSize needs. Exported for a focused, DOM-free test. */
export function containerDirection(style: Pick<CSSStyleDeclaration, 'display' | 'flexDirection'>): ContainerDirection {
  if (style.display.includes('grid')) return 'grid';
  return style.flexDirection?.startsWith('column') ? 'column' : 'row';
}

interface ActiveSlot {
  parentDom: HTMLElement;
  element: HTMLElement;
  signature: string;
  growAnimation: Animation | null;
}

interface ClosingSlot {
  element: HTMLElement;
  animation: Animation | null;
}

interface FlipAnimationEntry {
  element: HTMLElement;
  animation: Animation;
}

interface CollapsedOriginal {
  element: HTMLElement;
  // The WHOLE pre-collapse inline `style` attribute, restored verbatim
  // (setAttribute, or removeAttribute if it was empty) rather than tracked
  // property-by-property: robust to exactly which properties collapsing
  // touches (see the requestAnimationFrame callback below) without needing
  // to keep a restore list in sync with it.
  originalStyle: string;
}

function suppressUnhandledRejection(animation: Animation): void {
  animation.finished.catch(() => {});
}

// Every real, current browser this app targets implements the Web
// Animations API - this guard exists for the same reason lib/dom.ts's
// capturePointer/releasePointer check `typeof element.setPointerCapture ===
// 'function'` before calling it: jsdom (this repo's test environment) has
// no `Element.prototype.animate` at all unless a test stubs it onto the
// specific document it renders into, so a test exercising this hook through
// a real Editor it does not itself control (workbench.test.tsx's own,
// end-to-end drag test, rather than this file's own component test, which
// stubs it) would otherwise throw. Falls back to the same treatment as
// `prefers-reduced-motion` - the final state is already set synchronously
// wherever this is checked; skipping `.animate()` just means it appears
// immediately instead of transitioning in.
function canAnimate(element: Element): boolean {
  return typeof element.animate === 'function';
}

/**
 * `useDropPlaceholder()` (docs/superpowers/specs/2026-09-12-drop-placeholder-
 * design.md): while a Craft drag is in progress, keeps a plain
 * `div[data-drop-placeholder]` open at the exact slot `state.indicator`
 * reports, sized like the dragged element, with siblings sliding apart
 * (FLIP) to make room. Mounted as a bare hook (no rendered output of its
 * own - every DOM change here is imperative `insertBefore`/`remove`, not
 * React-rendered) directly in WorkbenchShell, the same level `LayerStackMenu`
 * (whose own `useLayerStack` this mirrors: the focused frame's document
 * through `useCanvasDocument`, capture-phase listeners doubled onto both
 * documents) is mounted at.
 *
 * Three effects, deliberately kept separate:
 * - The first attaches raw, capture-phase DOM listeners once (re-attached
 *   only when the focused frame's document changes): a `dragstart` sniff
 *   for the tray-item-type case, and `dragend`/`drop` cleanup - all three
 *   doubled onto both the parent document and the focused frame's, since a
 *   moved layer's own dragstart (like its dragend/drop) fires inside the
 *   iframe, never bubbling out to the parent document. Capture phase so
 *   they run before Craft's OWN `dragend` handler (bound directly to the
 *   dragged element, which only ever sees the target/bubble phases), which
 *   is what guarantees a manually-inserted, non-Craft placeholder is
 *   already gone before Craft (and the React re-render that follows its
 *   move/insert action) ever has to reconcile around it.
 * - The second reacts to Craft's own drag state (`state.indicator`,
 *   `state.events.dragged`, `state.nodes`) through a PLAIN
 *   `store.subscribe(collector, onChange)` call, not `useEditor`'s own
 *   collector (`useEditor(state => ...)`, which is `useCollector` underneath
 *   - see @craftjs/utils' `useCollector.d.ts`): that mechanism forces a React
 *   re-render (a `useState` setter) of whichever component calls it, and
 *   Craft's own actions can fire from deep inside another component's
 *   render/commit (e.g. a ref callback), which is exactly what produced
 *   React's dev-only "Cannot update a component (WorkbenchShell) while
 *   rendering a different component" warning on every drag (review finding
 *   4). `store.subscribe` is the SAME underlying mechanism `useCollector`
 *   calls (confirmed against the vendored 0.2.12 bundle's `he()`/`fe`
 *   classes) MINUS the `useState` wrapping - its `onChange` callback runs
 *   as a plain function, outside any component's render entirely, so there
 *   is no React state update for that warning to fire about. All the DOM
 *   work (open/move/close the slot, the FLIP) lives directly in that
 *   callback, matching where it always ran.
 * - The third is a mount-once cleanup for an unmount mid-drag.
 */
export function useDropPlaceholder(): void {
  const { store } = useEditor();
  const canvasDocument = useCanvasDocument();

  // Craft's live event-handler instance (see lib/craft-positioner.ts for why
  // this - not useEditor()'s `store` - is what actually owns the Positioner
  // whose cache invalidateDropCache clears), mirrored into a ref the same
  // way canvas-frame.tsx does its own reach-through: `null` outside of a
  // Craft `<Editor>`, or once a future Craft version renames/removes it -
  // invalidateDropCache degrades to a silent no-op either way.
  const eventHandler = useEventHandler() as unknown as CraftEventHandlerLike;
  const eventHandlerRef = useRef(eventHandler);
  useEffect(() => {
    eventHandlerRef.current = eventHandler;
  }, [eventHandler]);

  function invalidateNow(): void {
    invalidateDropCache(eventHandlerRef.current);
  }

  const activeRef = useRef<ActiveSlot | null>(null);
  const closingRef = useRef<ClosingSlot[]>([]);
  const flipAnimationsRef = useRef<FlipAnimationEntry[]>([]);
  const collapsedRef = useRef<CollapsedOriginal | null>(null);
  const draggedSizeRef = useRef<SizeHint | null>(null);
  const pendingNewTypeRef = useRef<string | null>(null);
  // Invalidates a scheduled-but-not-yet-run collapse rAF from a drag that
  // has since ended (see the "one frame after dragstart" scheduling below).
  const dragSessionRef = useRef(0);

  // Cancels every in-flight FLIP animation and synchronously clears the
  // manual `transform` it set, rather than leaving that to `finished`: a
  // cancelled Animation's `finished` promise only REJECTS (asynchronously),
  // and the reset used to live solely in the FULFILLED branch of that
  // promise - so a close, replace, dragend, drop, unmount or frame change
  // landing mid-FLIP used to cancel the animation but leave that sibling
  // permanently translated (review finding 1). Called from every one of
  // those teardown paths below.
  function cancelFlipAnimations(): void {
    for (const { element, animation } of flipAnimationsRef.current) {
      animation.cancel();
      element.style.transform = '';
    }
    flipAnimationsRef.current = [];
  }

  // Closes the open slot: removes the active placeholder (if any) and every
  // still-shrinking one, cancelling their animations - but leaves a
  // collapsed original layer and the tray-type/measured-size bookkeeping
  // alone, since this alone does not mean the drag itself has ended (an
  // indicator with an error, or none yet, still leaves the drag in
  // progress - spec: "invalid placements... insert nothing").
  function closeSlot(): void {
    if (activeRef.current) {
      activeRef.current.growAnimation?.cancel();
      activeRef.current.element.remove();
      activeRef.current = null;
    }
    for (const closing of closingRef.current) {
      closing.animation?.cancel();
      closing.element.remove();
    }
    closingRef.current = [];
    cancelFlipAnimations();
    invalidateNow();
  }

  // Ends the whole drag session: closes the slot, restores a collapsed
  // original layer (spec: "reappears on dragend if the drop is cancelled" -
  // applied unconditionally, on every dragend/drop, since restoring a node
  // that Craft's own move already relocated elsewhere is harmless), and
  // invalidates a pending collapse. Called from the capture-phase
  // dragend/drop listeners (must run synchronously, before Craft's own
  // handler) and on unmount.
  function endDragSession(): void {
    dragSessionRef.current += 1;
    closeSlot();
    if (collapsedRef.current) {
      const { element, originalStyle } = collapsedRef.current;
      if (originalStyle) element.setAttribute('style', originalStyle);
      else element.removeAttribute('style');
      collapsedRef.current = null;
    }
    draggedSizeRef.current = null;
    pendingNewTypeRef.current = null;
  }

  // Raw listeners: attached once per focused-frame-document identity (the
  // same "mount once except for canvasDocument" precedent useLayerStack's
  // own effect documents and relies on for the same reason - re-attaching
  // on every unrelated re-render would tear down mid-gesture).
  useEffect(() => {
    function onDragStart(event: DragEvent): void {
      const target = event.target;
      // isElementLike, not `instanceof Element` (lib/dom.ts): this listener
      // is doubled onto the focused frame's own document below, and an
      // element created there has THAT document's own Element constructor -
      // `instanceof Element` checked against the parent window's Element
      // silently returns false for it even though it plainly is one.
      pendingNewTypeRef.current = isElementLike(target)
        ? (target.closest(`[${TRAY_ITEM_ATTR}]`)?.getAttribute(TRAY_ITEM_ATTR) ?? null)
        : null;
    }

    const frameDocument = canvasDocument?.document;
    document.addEventListener('dragstart', onDragStart, true);
    frameDocument?.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', endDragSession, true);
    document.addEventListener('drop', endDragSession, true);
    frameDocument?.addEventListener('dragend', endDragSession, true);
    frameDocument?.addEventListener('drop', endDragSession, true);

    return () => {
      document.removeEventListener('dragstart', onDragStart, true);
      frameDocument?.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('dragend', endDragSession, true);
      document.removeEventListener('drop', endDragSession, true);
      frameDocument?.removeEventListener('dragend', endDragSession, true);
      frameDocument?.removeEventListener('drop', endDragSession, true);
      endDragSession();
    };
    // canvasDocument is the one deliberate dependency (matching
    // useLayerStack's identical effect and its own comment on this): every
    // function referenced above is a plain, freshly-defined-per-render
    // closure over refs only, so re-running this on every unrelated
    // re-render would tear down and reattach these listeners mid-gesture
    // for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasDocument]);

  // Reactive: opens, moves or closes the slot whenever Craft's own drag
  // state changes, through a plain store subscription rather than
  // useEditor's own collector (see this function's own doc comment above
  // for why - review finding 4). Imperatively mutates the `.style` of live
  // DOM elements reached through `nodes[id].dom` (a placeholder this hook
  // creates itself, and - for the FLIP transform, below - the real sibling
  // elements) - a DOM element is a mutable, imperative handle, not
  // React/Craft-owned state, and every such mutation here is either this
  // hook's own new node or a transform this hook itself clears once its
  // animation ends (or cancels it), never a Craft `data`/`props` value.
  useEffect(() => {
    return store.subscribe(
      (state) => ({
        nodes: state.nodes,
        // Craft's own type (`Indicator`, non-nullable) does not admit the
        // runtime reality: the live store's initial value - and the value
        // after every dragend - is a real `null` (confirmed against the
        // vendored 0.2.12 bundle's `editorInitialState` and `dropElement`'s
        // own `actions.setIndicator(null)`), not an all-optional
        // `Indicator`. This hook depends on that null case as much as on a
        // populated one, so it is retyped here rather than trusted at face
        // value.
        indicator: state.indicator as Indicator | null,
        draggedIds: state.events.dragged,
      }),
      ({ nodes, indicator, draggedIds }) => {
        if (!indicator || indicator.error) {
          closeSlot();
          return;
        }

        const { placement } = indicator;
        const parentDom = placement.parent.dom;
        // Defensive, matching Craft's own `setIndicator` guard (the
        // vendored bundle never even stores an indicator whose
        // parent/currentNode dom is missing) - a valid `indicator` should
        // always have one by construction.
        if (!parentDom) {
          closeSlot();
          return;
        }

        const childIds = placement.parent.data.nodes;
        // Filtered the same way Positioner.getChildDimensions filters its
        // own dimensions array (only children with a live `dom`) -
        // `placement.index` is already an index into that filtered list,
        // not the raw id array.
        const childDoms = childIds
          .map((id) => nodes[id]?.dom ?? null)
          .filter((dom): dom is HTMLElement => dom !== null);

        const slotIndex = insertionIndex(placement);
        const direction = containerDirection(getComputedStyle(parentDom));
        const signature = `${placement.parent.id}|${slotIndex}`;

        if (
          activeRef.current &&
          activeRef.current.signature === signature &&
          activeRef.current.parentDom === parentDom
        ) {
          return; // already open at the right spot
        }

        // Neutralize any FLIP still running from the PREVIOUS slot before
        // measuring "before" rects for this one: a leftover transform would
        // make getBoundingClientRect reflect a mid-animation position
        // instead of the settled layout, corrupting the deltas computed
        // below for the new move (review finding 1's "replace" teardown
        // path - close/dragend/drop/unmount/frame-change all already funnel
        // through closeSlot, which does the same).
        cancelFlipAnimations();

        const reduced = reducedMotion();

        const beforeRects: Record<string, FlipRect> = {};
        for (const id of childIds) {
          const dom = nodes[id]?.dom;
          if (dom) beforeRects[id] = dom.getBoundingClientRect();
        }

        if (activeRef.current) {
          const closing = activeRef.current;
          closing.growAnimation?.cancel();
          if (reduced || !canAnimate(closing.element)) {
            closing.element.remove();
          } else {
            const rect = closing.element.getBoundingClientRect();
            const animation = closing.element.animate(
              [
                { width: `${rect.width}px`, height: `${rect.height}px` },
                { width: '0px', height: '0px' },
              ],
              { duration: TRANSITION_MS, easing: 'ease-out' },
            );
            suppressUnhandledRejection(animation);
            closingRef.current.push({ element: closing.element, animation });
            animation.finished.then(
              () => {
                closing.element.remove();
                closingRef.current = closingRef.current.filter((slot) => slot.element !== closing.element);
              },
              () => {}, // cancelled from closeSlot/endDragSession - already removed there
            );
          }
          activeRef.current = null;
        }

        const kind: PlaceholderKind = draggedIds.size > 0 ? 'existing' : 'new';
        let hint: SizeHint | null;
        if (kind === 'existing') {
          if (draggedSizeRef.current === null) {
            const draggedId = [...draggedIds][0];
            const draggedDom = nodes[draggedId]?.dom ?? null;
            if (draggedDom) {
              const rect = draggedDom.getBoundingClientRect();
              draggedSizeRef.current = { width: rect.width, height: rect.height };
              const originalStyle = draggedDom.getAttribute('style') ?? '';
              const sessionAtSchedule = dragSessionRef.current;
              // "Hidden one frame after dragstart, so the browser keeps its
              // drag image" (spec section 2) - collapsing synchronously
              // here, before the browser has snapshotted the drag ghost,
              // can make that ghost blank in some browsers.
              requestAnimationFrame(() => {
                if (dragSessionRef.current !== sessionAtSchedule || collapsedRef.current) return;
                // visibility:hidden plus a zeroed box, not display:none
                // (review finding 3): the element stays in Craft's own
                // child list (`parent.data.nodes`) either way, but
                // display:none collapses its getBoundingClientRect to
                // (0,0) at the document origin - a discontinuity next to
                // its real siblings' positions that can shift Craft's own
                // computed insertion index by one (getChildDimensions/
                // Je in the vendored bundle walk EVERY id in data.nodes
                // regardless of visibility, and Je's own in-flow placement
                // math keys off top/outerHeight, so a well-formed
                // zero-height, zero-margin box at its OWN natural flow
                // position never corrupts it the way a box collapsed to
                // the origin can). Zeroing width too keeps the same true
                // for a row-direction container's own gap, since Je does
                // not use width for in-flow comparisons but this hook's
                // OWN "does the slot visually close" requirement (spec)
                // still needs it collapsed on whichever axis is the
                // container's main one.
                draggedDom.style.visibility = 'hidden';
                draggedDom.style.width = '0px';
                draggedDom.style.height = '0px';
                draggedDom.style.marginTop = '0px';
                draggedDom.style.marginRight = '0px';
                draggedDom.style.marginBottom = '0px';
                draggedDom.style.marginLeft = '0px';
                collapsedRef.current = { element: draggedDom, originalStyle };
                invalidateNow();
              });
            }
          }
          hint = draggedSizeRef.current;
        } else {
          hint = trayItems.find((item) => item.type === pendingNewTypeRef.current)?.previewSize ?? null;
        }

        const size = placeholderSize(kind, hint, direction);
        const doc = parentDom.ownerDocument;
        const placeholder = doc.createElement('div');
        placeholder.setAttribute(PLACEHOLDER_ATTR, '');
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.className = 'pointer-events-none';
        placeholder.style.flex = '0 0 auto';
        placeholder.style.width = size.width !== null ? `${size.width}px` : direction === 'grid' ? '' : '100%';
        placeholder.style.height = size.height !== null ? `${size.height}px` : direction === 'grid' ? '' : '100%';

        parentDom.insertBefore(placeholder, childDoms[slotIndex] ?? null);
        invalidateNow();

        let growAnimation: Animation | null = null;
        if (!reduced && canAnimate(placeholder)) {
          const from: Keyframe = {};
          const to: Keyframe = {};
          if (size.width !== null) {
            from.width = '0px';
            to.width = `${size.width}px`;
          }
          if (size.height !== null) {
            from.height = '0px';
            to.height = `${size.height}px`;
          }
          if (Object.keys(to).length > 0) {
            growAnimation = placeholder.animate([from, to], { duration: TRANSITION_MS, easing: 'ease-out' });
            suppressUnhandledRejection(growAnimation);
          }
        }
        activeRef.current = { parentDom, element: placeholder, signature, growAnimation };

        if (!reduced) {
          for (const id of childIds) {
            const dom = nodes[id]?.dom;
            if (dom) beforeRects[id] ??= dom.getBoundingClientRect(); // a child added mid-drag has no "before" - FLIP skips it
          }
          const afterRects: Record<string, FlipRect> = {};
          for (const id of childIds) {
            const dom = nodes[id]?.dom;
            if (dom) afterRects[id] = dom.getBoundingClientRect();
          }
          const deltas = flipDeltas(beforeRects, afterRects);
          const cycleFlipAnimations: Animation[] = [];
          for (const [id, delta] of Object.entries(deltas)) {
            if (delta.dx === 0 && delta.dy === 0) continue;
            const dom = nodes[id]?.dom;
            if (!dom || !canAnimate(dom)) continue;
            // The inverse FLIP transform, cleared once the animation below
            // ends OR is cancelled (cancelFlipAnimations, above).
            dom.style.transform = `translate(${delta.dx}px, ${delta.dy}px)`;
            const flipAnimation = dom.animate(
              [{ transform: `translate(${delta.dx}px, ${delta.dy}px)` }, { transform: 'translate(0px, 0px)' }],
              { duration: TRANSITION_MS, easing: 'ease-out' },
            );
            suppressUnhandledRejection(flipAnimation);
            flipAnimationsRef.current.push({ element: dom, animation: flipAnimation });
            cycleFlipAnimations.push(flipAnimation);
            flipAnimation.finished.then(
              () => {
                dom.style.transform = '';
                flipAnimationsRef.current = flipAnimationsRef.current.filter(
                  (entry) => entry.animation !== flipAnimation,
                );
              },
              () => {}, // cancelled - cancelFlipAnimations() already reset the transform and cleared the array synchronously
            );
          }
          // Craft may re-measure the hovered container's children while
          // this FLIP is still settling (a quick re-entry); invalidate
          // once more when every animation from THIS cycle has finished so
          // that re-measurement never catches a mid-animation transform
          // (review finding 2).
          if (cycleFlipAnimations.length > 0) {
            Promise.allSettled(cycleFlipAnimations.map((animation) => animation.finished)).then(() => {
              invalidateNow();
            });
          }
        }
      },
      true, // collectOnCreate: process the current drag state immediately, the same as useEditor's own collector did on first render
    );
    // store is the one deliberate dependency: closeSlot, cancelFlipAnimations
    // and invalidateNow (called inside the collector's onChange above) are
    // plain, freshly-defined-per-render closures over refs (and the stable
    // eventHandlerRef/store) only - the same "mount once except for the one
    // thing that can actually change identity" precedent this file's other
    // two effects already document. Re-subscribing on every unrelated
    // re-render would drop and recreate the subscription for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // Mount-once cleanup for an unmount mid-drag; endDragSession is a plain,
  // freshly-defined-per-render closure over refs only (same rationale as
  // the listener effect above), so it is deliberately excluded rather than
  // making this effect's cleanup re-run on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => endDragSession(), []);
}
