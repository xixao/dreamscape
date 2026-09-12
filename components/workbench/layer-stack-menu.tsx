'use client';

import { useEditor, type EditorState } from '@craftjs/core';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { trayItems } from '@/components/blocks/registry';
import {
  HOLD_MS,
  MOVE_TOLERANCE_PX,
  stackUnder,
  type LayerStackEntry,
  type LayerStackNode,
} from '@/lib/layer-stack';
import { cn } from '@/lib/utils';
import { MENU_HINT, MENU_POPOVER, MENU_ROW, MENU_SELECTED_CHIP } from './chrome';
import { selectedIdFrom } from './selection';

const STAGE_COLUMN_SELECTOR = '[data-testid="stage-column"]';
const ARTBOARD_SELECTOR = '[data-artboard]';
const MENU_OFFSET = 8;
const MENU_MARGIN = 8;
const HINT_TEXT = 'Hold on a layer to open this menu';
const HINT_SESSION_KEY = 'assembly-workbench:layer-stack-hint-opens';
const HINT_MAX_OPENS = 3;

interface LayerStackState {
  open: boolean;
  // The raw press point, kept separate from the rendered position: the
  // popover's actual `x`/`y` are derived from this plus the measured
  // popover size (see `flipToFit` and the `useLayoutEffect` in
  // `LayerStackMenu`) and can flip to the opposite side of the cursor.
  anchorX: number;
  anchorY: number;
  entries: LayerStackEntry[];
  selectedId: string | null;
  showHint: boolean;
}

const CLOSED_STATE: LayerStackState = {
  open: false,
  anchorX: 0,
  anchorY: 0,
  entries: [],
  selectedId: null,
  showHint: false,
};

function flattenNodes(nodes: EditorState['nodes']): Record<string, LayerStackNode> {
  const flat: Record<string, LayerStackNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    flat[id] = {
      id,
      dom: node.dom,
      parent: node.data.parent,
      name: node.data.name,
      displayName: node.data.displayName || node.data.name,
    };
  }
  return flat;
}

function iconFor(name: string) {
  return trayItems.find((item) => item.type === name)?.icon ?? null;
}

// A session-only nudge, shown only the first few times someone discovers the
// gesture; sessionStorage rather than localStorage because it should not
// follow the user to their next visit. Wrapped in try/catch: sessionStorage
// throws in some locked-down browser contexts (private mode, embedded
// iframes with storage disabled), and losing the hint is harmless.
function nextHintOpenCount(): number {
  try {
    const raw = window.sessionStorage.getItem(HINT_SESSION_KEY);
    const count = (raw ? Number(raw) : 0) + 1;
    window.sessionStorage.setItem(HINT_SESSION_KEY, String(count));
    return count;
  } catch {
    return HINT_MAX_OPENS + 1;
  }
}

// Offsets the popover from the press point, then flips it to the opposite
// side of the cursor on whichever axis would otherwise push it past the
// window edge, and finally clamps both axes so the flipped position itself
// never sits off the top/left edge (a popover taller/wider than the
// window). `width`/`height` must come from measuring the actual rendered
// popover (see the `useLayoutEffect` in `LayerStackMenu`) - clamping the
// anchor alone (the previous approach) cannot prevent overflow because it
// never accounts for the popover's own size.
function flipToFit(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  let x = clientX + MENU_OFFSET;
  let y = clientY + MENU_OFFSET;
  if (typeof window !== 'undefined') {
    if (x + width + MENU_MARGIN > window.innerWidth) {
      x = clientX - MENU_MARGIN - width;
    }
    if (y + height + MENU_MARGIN > window.innerHeight) {
      y = clientY - MENU_MARGIN - height;
    }
  }
  return { x: Math.max(x, MENU_MARGIN), y: Math.max(y, MENU_MARGIN) };
}

/**
 * Detects the press-and-hold gesture on a layer inside the artboard and owns
 * the menu's `{ open, anchorX, anchorY, entries }` (spec
 * docs/superpowers/specs/2026-09-12-layer-stack-menu-design.md #4), plus the
 * currently-selected id and whether to show the first-opens hint. `anchorX`/
 * `anchorY` are the raw press point; `LayerStackMenu` derives the actual
 * rendered position from these plus the popover's measured size.
 *
 * Must run inside Craft's `Editor` context (it calls `useEditor`); `LayerStackMenu`
 * calls it and is rendered inside `WorkbenchShell`'s `<Editor>`.
 */
export function useLayerStack() {
  const { actions, query, store } = useEditor();
  const [state, setState] = useState<LayerStackState>(CLOSED_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const swallowNextClickRef = useRef(false);
  const swallowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    store.actions.setNodeEvent('hovered', []);
    setState(CLOSED_STATE);
  }, [store]);

  const select = useCallback(
    (id: string) => {
      actions.selectNode(id);
      close();
    },
    [actions, close],
  );

  useEffect(() => {
    const column = document.querySelector<HTMLElement>(STAGE_COLUMN_SELECTOR);
    if (!column) return;

    function clearHold() {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pressRef.current = null;
    }

    function clearSwallowTimeout() {
      if (swallowTimeoutRef.current !== null) {
        clearTimeout(swallowTimeoutRef.current);
        swallowTimeoutRef.current = null;
      }
    }

    function onPointerDown(event: PointerEvent) {
      // Every new press invalidates whatever the previous gesture armed.
      // Without this, a hold whose trailing `click` never reaches the
      // column (the release landed outside it, or nothing else consumed
      // it) leaves `swallowNextClickRef` armed forever, and it would go on
      // to eat the click from a later, completely unrelated gesture.
      swallowNextClickRef.current = false;
      clearSwallowTimeout();

      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(ARTBOARD_SELECTOR)) return;

      pressRef.current = { x: event.clientX, y: event.clientY };
      clearTimeout(timerRef.current ?? undefined);
      const pressClientX = event.clientX;
      const pressClientY = event.clientY;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pressRef.current = null;

        // Read live rather than from a closed-over snapshot: Craft's store
        // can have moved on since the timer was scheduled 350 ms ago (same
        // reasoning as the live `query.getState()` read in keyboard.tsx).
        const liveState = query.getState();
        const entries = stackUnder(flattenNodes(liveState.nodes), target);
        if (entries.length === 0) return;

        swallowNextClickRef.current = true;
        // Belt-and-suspenders alongside the pointerdown reset above: if no
        // click at all follows this hold (the pointer is released
        // somewhere that never dispatches one), this still disarms the
        // flag on its own after a short delay instead of leaking it
        // indefinitely into whatever gesture happens next.
        clearSwallowTimeout();
        swallowTimeoutRef.current = setTimeout(() => {
          swallowNextClickRef.current = false;
          swallowTimeoutRef.current = null;
        }, 500);
        const opens = nextHintOpenCount();
        setState({
          open: true,
          anchorX: pressClientX,
          anchorY: pressClientY,
          entries,
          selectedId: selectedIdFrom(liveState),
          showHint: opens <= HINT_MAX_OPENS,
        });
      }, HOLD_MS);
    }

    function onPointerMove(event: PointerEvent) {
      const press = pressRef.current;
      if (!press) return;
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) clearHold();
    }

    function onHoldInterrupted() {
      clearHold();
    }

    // Escape cancels a pending hold the same way pointerup/pointercancel/
    // dragstart do (spec #2's cancellation list also names Escape), rather
    // than only closing an already-open menu - that's the separate `window`
    // keydown listener in `LayerStackMenu` below, scoped to while `open`.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && pressRef.current !== null) clearHold();
    }

    // Capture phase, on the column specifically, so this always runs before
    // the click could reach Craft's own click-to-select handling or bubble
    // out as a plain canvas click: a press-and-release that completed a
    // hold produces a real trailing `click` on the pressed element (mousedown
    // and mouseup on the same target), which must count for nothing (spec
    // #2) - not reopen/reselect anything, and not read as "clicked outside
    // the menu" by the listener LayerStackMenu attaches once open.
    function onClickCapture(event: MouseEvent) {
      if (!swallowNextClickRef.current) return;
      swallowNextClickRef.current = false;
      clearSwallowTimeout();
      event.preventDefault();
      event.stopPropagation();
    }

    column.addEventListener('pointerdown', onPointerDown);
    column.addEventListener('pointermove', onPointerMove);
    column.addEventListener('pointerup', onHoldInterrupted);
    column.addEventListener('pointercancel', onHoldInterrupted);
    column.addEventListener('dragstart', onHoldInterrupted);
    column.addEventListener('keydown', onKeyDown);
    column.addEventListener('click', onClickCapture, true);
    return () => {
      clearHold();
      clearSwallowTimeout();
      column.removeEventListener('pointerdown', onPointerDown);
      column.removeEventListener('pointermove', onPointerMove);
      column.removeEventListener('pointerup', onHoldInterrupted);
      column.removeEventListener('pointercancel', onHoldInterrupted);
      column.removeEventListener('dragstart', onHoldInterrupted);
      column.removeEventListener('keydown', onKeyDown);
      column.removeEventListener('click', onClickCapture, true);
    };
    // Deliberately mount-once: `query` reads Craft's live store no matter
    // which render's reference is captured (same point keyboard.tsx makes
    // about reading selection live), so nothing is gained by re-subscribing
    // when it changes reference - and re-subscribing WOULD tear down and
    // restart these listeners mid-gesture on any unrelated re-render of
    // WorkbenchShell, silently cancelling a hold that happened to be
    // pending at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, close, select };
}

export function LayerStackMenu() {
  const { store } = useEditor();
  const { open, anchorX, anchorY, entries, selectedId, showHint, close, select } = useLayerStack();
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Null until the popover has been measured at least once for this open;
  // rendered hidden until then (see `style` below) so the naive,
  // possibly-overflowing anchor position never actually paints.
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  // Reset the active row exactly on the open transition, adjusted during
  // render (same technique as topbar.tsx's FileNameField) rather than in an
  // effect: doing it here applies before this render commits instead of
  // costing an extra one, and avoids re-running on every `entries`/
  // `selectedId` change, which would fight the user's own arrow-key
  // navigation. The measured `position` is reset here too: whichever way
  // `open` just flipped, any position measured for the previous anchor is
  // stale, so the popover must go back to rendering hidden-until-measured
  // (see `style` below) instead of flashing at an old spot.
  const [trackedOpen, setTrackedOpen] = useState(false);
  if (open !== trackedOpen) {
    setTrackedOpen(open);
    setPosition(null);
    if (open) {
      const selected = entries.findIndex((entry) => entry.id === selectedId);
      setActiveIndex(selected >= 0 ? selected : 0);
    }
  }

  useEffect(() => {
    if (open) menuRef.current?.focus();
  }, [open]);

  // Flips the popover to the opposite side of the cursor on whichever axis
  // would otherwise push it past the window edge (spec #1: clamping the
  // anchor alone still let it overflow near the right/bottom edge).
  // `useLayoutEffect` so this measure-then-reposition happens before the
  // browser paints: the popover commits once at the naive, hidden position
  // (see `style` below), this effect immediately corrects it, and the
  // browser only ever paints the corrected position - never the naive one.
  // Only ever calls `setState` after actually reading the DOM it measures
  // (the render above already handles resetting `position` when there is
  // nothing to measure), matching the pattern React's own docs use for
  // measure-then-reposition effects.
  useLayoutEffect(() => {
    if (!open || entries.length === 0) return;
    const rect = menuRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(flipToFit(anchorX, anchorY, rect.width, rect.height));
  }, [open, entries, anchorX, anchorY]);

  // Close triggers that are not the gesture itself (spec #2): Escape,
  // Cmd/Ctrl+\ (the same Show/Hide UI chord), clicking outside the menu, or
  // scrolling the stage. Scoped to while the menu is open, and torn down the
  // moment it closes.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key === '\\')) {
        close();
      }
    }

    function onDocumentClick(event: MouseEvent) {
      const menu = menuRef.current;
      if (menu && event.target instanceof Node && menu.contains(event.target)) return;
      close();
    }

    function onScroll() {
      close();
    }

    const column = document.querySelector<HTMLElement>(STAGE_COLUMN_SELECTOR);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onDocumentClick);
    column?.addEventListener('scroll', onScroll);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onDocumentClick);
      column?.removeEventListener('scroll', onScroll);
    };
  }, [open, close]);

  if (!open || typeof document === 'undefined') return null;

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, entries.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = entries[activeIndex];
      if (entry) select(entry.id);
    }
  }

  // Before the first measurement, render at the naive (unflipped) offset but
  // hidden, so a popover that would have overflowed never has a chance to
  // paint at the wrong spot first.
  const style: CSSProperties = position
    ? { left: position.x, top: position.y }
    : { left: anchorX + MENU_OFFSET, top: anchorY + MENU_OFFSET, visibility: 'hidden' };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Layer stack"
      tabIndex={-1}
      data-testid="layer-stack-menu"
      className={cn(MENU_POPOVER, 'fixed z-50 outline-none')}
      style={style}
      onKeyDown={onMenuKeyDown}
      onPointerLeave={() => store.actions.setNodeEvent('hovered', [])}
    >
      <div role="none" className="flex flex-col">
        {entries.map((entry, index) => {
          const Icon = iconFor(entry.name);
          const isSelected = entry.id === selectedId;
          return (
            <div
              key={entry.id}
              role="menuitem"
              tabIndex={-1}
              className={cn(MENU_ROW, 'cursor-default', index === activeIndex && 'bg-accent')}
              onPointerEnter={() => {
                setActiveIndex(index);
                store.actions.setNodeEvent('hovered', entry.id);
              }}
              onClick={() => select(entry.id)}
            >
              {Icon && <Icon className="size-3.5 shrink-0 text-acc2" aria-hidden />}
              <span className="flex-1 truncate text-foreground">{entry.displayName}</span>
              {isSelected && <span className={MENU_SELECTED_CHIP}>selected</span>}
            </div>
          );
        })}
      </div>
      {showHint && <p className={cn(MENU_HINT, 'px-2 pt-1.5')}>{HINT_TEXT}</p>}
    </div>,
    document.body,
  );
}
