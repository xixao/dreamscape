'use client';

import { useEditor, type Indicator } from '@craftjs/core';
import { useEffect, useRef } from 'react';
import { trayItems } from '@/components/blocks/registry';
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

// Marks the plain DOM element this hook inserts - never a Craft node, so
// Craft's own placement maths (which walks `parent.data.nodes`, its own
// tracked child-id list - see lib/craft-positioner.ts's header comment and
// the vendored 0.2.12 bundle's Positioner.getChildDimensions) never sees or
// counts it. Also what tests query for.
const PLACEHOLDER_ATTR = 'data-drop-placeholder';

// component-tray.tsx stamps this on the exact <li> its connectors.create
// ref lives on, so a raw dragstart on it (or a descendant) identifies which
// TrayItem is being dragged - the only way to learn that, since a "new"
// DragTarget's tree/component is private to Craft's own DefaultEventHandlers
// instance and never reaches `state` at all (unlike an "existing" drag,
// which state.events.dragged exposes directly).
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

interface CollapsedOriginal {
  element: HTMLElement;
  originalDisplay: string;
}

function suppressUnhandledRejection(animation: Animation): void {
  animation.finished.catch(() => {});
}

/**
 * `useDropPlaceholder()` (docs/superpowers/specs/2026-09-12-drop-placeholder-
 * design.md): while a Craft drag is in progress, keeps a plain
 * `div[data-drop-placeholder]` open at the exact slot `state.indicator`
 * reports, sized like the dragged element, with siblings sliding apart
 * (FLIP) to make room. Mounted as a bare hook (no rendered output of its
 * own - every DOM change here is imperative `insertBefore`/`remove`, not
 * React-rendered) directly in WorkbenchShell, the same level `LayerStackMenu`
 * (whose own `useLayerStack` this mirrors: collectors through `useEditor`,
 * the focused frame's document through `useCanvasDocument`, capture-phase
 * listeners doubled onto both documents) is mounted at.
 *
 * Two effects, deliberately kept separate:
 * - The first attaches raw, capture-phase DOM listeners once (re-attached
 *   only when the focused frame's document changes): a `dragstart` sniff
 *   for the tray-item-type case, and `dragend`/`drop` cleanup on both the
 *   parent document and the focused frame's - capture phase so they run
 *   before Craft's OWN `dragend` handler (bound directly to the dragged
 *   element, which only ever sees the target/bubble phases), which is what
 *   guarantees a manually-inserted, non-Craft placeholder is already gone
 *   before Craft (and the React re-render that follows its move/insert
 *   action) ever has to reconcile around it.
 * - The second reacts to Craft's own state (`state.indicator`,
 *   `state.events.dragged`, collected through `useEditor`) and does the
 *   actual open/move/close-the-slot DOM work.
 */
export function useDropPlaceholder(): void {
  const { nodes, indicator, draggedIds } = useEditor((state) => ({
    nodes: state.nodes,
    // Craft's own type (`Indicator`, non-nullable) does not admit the
    // runtime reality: the live store's initial value - and the value
    // after every dragend - is a real `null` (confirmed against the
    // vendored 0.2.12 bundle's `editorInitialState` and `dropElement`'s own
    // `actions.setIndicator(null)`), not an all-optional `Indicator`. This
    // hook depends on that null case as much as on a populated one, so it
    // is retyped here rather than trusted at face value.
    indicator: state.indicator as Indicator | null,
    draggedIds: state.events.dragged,
  }));
  const canvasDocument = useCanvasDocument();

  const activeRef = useRef<ActiveSlot | null>(null);
  const closingRef = useRef<ClosingSlot[]>([]);
  const flipAnimationsRef = useRef<Animation[]>([]);
  const collapsedRef = useRef<CollapsedOriginal | null>(null);
  const draggedSizeRef = useRef<SizeHint | null>(null);
  const pendingNewTypeRef = useRef<string | null>(null);
  // Invalidates a scheduled-but-not-yet-run collapse rAF from a drag that
  // has since ended (see the "one frame after dragstart" scheduling below).
  const dragSessionRef = useRef(0);

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
    for (const animation of flipAnimationsRef.current) animation.cancel();
    flipAnimationsRef.current = [];
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
      collapsedRef.current.element.style.display = collapsedRef.current.originalDisplay;
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
      pendingNewTypeRef.current =
        target instanceof Element ? target.closest(`[${TRAY_ITEM_ATTR}]`)?.getAttribute(TRAY_ITEM_ATTR) ?? null : null;
    }

    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', endDragSession, true);
    document.addEventListener('drop', endDragSession, true);
    const frameDocument = canvasDocument?.document;
    frameDocument?.addEventListener('dragend', endDragSession, true);
    frameDocument?.addEventListener('drop', endDragSession, true);

    return () => {
      document.removeEventListener('dragstart', onDragStart, true);
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
  // state changes. Imperatively mutates the `.style` of live DOM elements
  // reached through `nodes[id].dom` (a placeholder this hook creates
  // itself, and - for the FLIP transform, below - the real sibling
  // elements) - a DOM element is a mutable, imperative handle, not
  // React/Craft-owned state, and every such mutation here is either this
  // hook's own new node or a transform this hook itself clears once its
  // animation ends, never a Craft `data`/`props` value.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (!indicator || indicator.error) {
      closeSlot();
      return;
    }

    const { placement } = indicator;
    const parentDom = placement.parent.dom;
    // Defensive, matching Craft's own `setIndicator` guard (the vendored
    // bundle never even stores an indicator whose parent/currentNode dom is
    // missing) - a valid `indicator` should always have one by construction.
    if (!parentDom) {
      closeSlot();
      return;
    }

    const childIds = placement.parent.data.nodes;
    // Filtered the same way Positioner.getChildDimensions filters its own
    // dimensions array (only children with a live `dom`) - `placement.index`
    // is already an index into that filtered list, not the raw id array.
    const childDoms = childIds.map((id) => nodes[id]?.dom ?? null).filter((dom): dom is HTMLElement => dom !== null);

    const slotIndex = insertionIndex(placement);
    const direction = containerDirection(getComputedStyle(parentDom));
    const signature = `${placement.parent.id}|${slotIndex}`;

    if (activeRef.current && activeRef.current.signature === signature && activeRef.current.parentDom === parentDom) {
      return; // already open at the right spot
    }

    const reduced = reducedMotion();

    const beforeRects: Record<string, FlipRect> = {};
    for (const id of childIds) {
      const dom = nodes[id]?.dom;
      if (dom) beforeRects[id] = dom.getBoundingClientRect();
    }

    if (activeRef.current) {
      const closing = activeRef.current;
      closing.growAnimation?.cancel();
      if (reduced) {
        closing.element.remove();
      } else {
        const rect = closing.element.getBoundingClientRect();
        const animation = closing.element.animate(
          [{ width: `${rect.width}px`, height: `${rect.height}px` }, { width: '0px', height: '0px' }],
          { duration: TRANSITION_MS, easing: 'ease-out' },
        );
        suppressUnhandledRejection(animation);
        closingRef.current.push({ element: closing.element, animation });
        animation.finished.then(() => {
          closing.element.remove();
          closingRef.current = closingRef.current.filter((slot) => slot.element !== closing.element);
        }, () => {}); // cancelled from closeSlot/endDragSession - already removed there
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
          const originalDisplay = draggedDom.style.display;
          const sessionAtSchedule = dragSessionRef.current;
          // "Hidden one frame after dragstart, so the browser keeps its
          // drag image" (spec section 2) - collapsing synchronously here,
          // before the browser has snapshotted the drag ghost, can make
          // that ghost blank in some browsers.
          requestAnimationFrame(() => {
            if (dragSessionRef.current !== sessionAtSchedule || collapsedRef.current) return;
            draggedDom.style.display = 'none';
            collapsedRef.current = { element: draggedDom, originalDisplay };
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

    let growAnimation: Animation | null = null;
    if (!reduced) {
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
      for (const [id, delta] of Object.entries(deltas)) {
        if (delta.dx === 0 && delta.dy === 0) continue;
        const dom = nodes[id]?.dom;
        if (!dom) continue;
        // The inverse FLIP transform, cleared once the animation below ends.
        // eslint-disable-next-line react-hooks/immutability
        dom.style.transform = `translate(${delta.dx}px, ${delta.dy}px)`;
        const flipAnimation = dom.animate(
          [{ transform: `translate(${delta.dx}px, ${delta.dy}px)` }, { transform: 'translate(0px, 0px)' }],
          { duration: TRANSITION_MS, easing: 'ease-out' },
        );
        suppressUnhandledRejection(flipAnimation);
        flipAnimationsRef.current.push(flipAnimation);
        flipAnimation.finished.then(() => {
          dom.style.transform = '';
          flipAnimationsRef.current = flipAnimationsRef.current.filter((animation) => animation !== flipAnimation);
        }, () => {});
      }
    }
  }, [indicator, draggedIds, nodes]);

  // Mount-once cleanup for an unmount mid-drag; endDragSession is a plain,
  // freshly-defined-per-render closure over refs only (same rationale as
  // the listener effect above), so it is deliberately excluded rather than
  // making this effect's cleanup re-run on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => endDragSession(), []);
}
