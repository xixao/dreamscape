'use client';

import { ROOT_NODE, useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { ZONE_TYPES } from '@/components/blocks/registry';
import { isEditableTarget, isElementLike } from '@/lib/dom';
export { isEditableTarget };
import { matchShortcut, SHORTCUTS_BY_ID } from '@/lib/shortcuts';
import type { PanelMode } from '@/lib/workbench/panel-store';
import { useCanvasDocument } from './canvas-frame';
import { selectedIdFrom } from './selection';


// A popup or dialog owns the interaction while it is open: Delete/Backspace should
// remove text or a list item inside it, not the selected block behind it, and
// Escape/undo should be free to close the popup instead of touching the stage.

// isElementLike (lib/dom.ts) is duck-typed rather than `target instanceof
// HTMLElement`: with the frame now sometimes living in an iframe
// (canvas-frame.tsx), a keydown's target can be an element from that
// document's own realm, which has its own `HTMLElement` constructor -
// `instanceof` against the parent window's would silently return false for
// it even though it plainly is one (typing Delete into a text block inside
// the frame would fall through to deleting the block).


// stage.tsx's resize handles (role="separator") handle their own arrow-key
// stepping and stop that keydown from bubbling here at all (see the comment
// there) - this is the second, independent half of that fix: the diagram
// shortcuts below must not ALSO act on a press meant for a focused handle,
// regardless of propagation. Scoped to just those three diagram shortcuts
// (nudge, delete, duplicate) rather than folded into isEditableTarget
// itself, which gates every OTHER shortcut too (zoom, present, page
// navigation, ...) - none of which conflict with a resize handle the way a
// diagram nudge, delete or duplicate does.
function isSeparatorTarget(target: EventTarget | null): boolean {
  return isElementLike(target) && target.closest('[role="separator"]') !== null;
}

export function useWorkbenchKeyboard(
  options: {
    onToggleUi?: () => void;
    onToggleChat?: () => void;
    // Minimize/expand the right panel (docs/superpowers/specs/2026-09-12-panels-and-zoom-design.md
    // section 2), same precedence as Show/Hide UI and the chat toggle below:
    // Cmd+. (Ctrl+. elsewhere) must still work while a text field, select or
    // dialog owns the interaction.
    onTogglePanelCollapsed?: () => void;
    // Comment tool (spec docs/superpowers/specs/2026-09-13-shortcuts-and-
    // elements-design.md section 2): `onToggleCommentMode` now fires on
    // Shift+C, not a bare "c" (that opens/closes the chat panel through
    // `onToggleChat` instead - see the registry's 'chat-toggle' vs
    // 'tool-comment' ids in lib/shortcuts.ts). `commentMode` tells Escape
    // whether to leave the tool (via `onExitCommentMode`) instead of its
    // usual deselect. The toggle logic itself lives with whoever owns the
    // `commentMode` state (WorkbenchShell), same as `onToggleUi` never owns
    // `uiHidden` itself.
    onToggleCommentMode?: () => void;
    commentMode?: boolean;
    onExitCommentMode?: () => void;
    // Diagram tool (spec docs/superpowers/specs/2026-09-13-diagrams-design.md
    // section 3): Shift+D opens/closes the floating shape palette, same
    // toggle shape as onToggleCommentMode above - the palette-open/armed-
    // tool state itself lives with WorkbenchShell.
    onDiagramTool?: () => void;
    // Whether the diagram palette is open/a placement tool is armed -
    // Escape (like commentMode above) leaves it instead of its usual
    // deselect; checked after commentMode and before the plain diagram
    // selection check just below, matching the "leave a tool before you
    // touch the canvas" precedence commentMode already has.
    diagramToolActive?: boolean;
    onExitDiagramTool?: () => void;
    // Whether a diagram shape or connector (not a Craft block) is currently
    // selected: Delete/Cmd+D/arrow-nudge/Undo/Redo all act on the diagram
    // instead of the focused frame while this is true (spec section 6:
    // "when a diagram element is selected, ... undo applies to the diagram;
    // otherwise to the focused frame, as today"), and a plain Escape (no
    // tool, no comment mode) clears it via onDeselectDiagram instead of
    // falling through to actions.selectNode().
    diagramSelectionActive?: boolean;
    onDeselectDiagram?: () => void;
    // Whether one or more frames are selected on the canvas (spec docs/
    // superpowers/specs/2026-09-13-grid-snapping-alignment-design.md
    // section 3/4: "Escape clears the selection") - checked after
    // diagramSelectionActive and before the plain actions.selectNode()
    // fallback, the same precedence position every other "leave this state
    // instead of the default deselect" check above already occupies.
    frameSelectionActive?: boolean;
    onClearFrameSelection?: () => void;
    onDiagramDelete?: () => void;
    onDiagramDuplicate?: () => void;
    onDiagramSelectAll?: () => void;
    // `big` is Shift held: 1 px plain, 8 px with Shift (Matt, 2026-09-13:
    // dropped the earlier 8/64 px split in favour of matching the canvas's
    // own 8 px grid). The four arrow keys nudge whichever selection is
    // active - the diagram (onDiagramNudge) when diagramSelectionActive, a
    // canvas frame selection (onFrameNudge) otherwise when
    // frameSelectionActive - diagram wins when both are somehow true.
    onDiagramNudge?: (direction: 'up' | 'down' | 'left' | 'right', big: boolean) => void;
    onFrameNudge?: (direction: 'up' | 'down' | 'left' | 'right', big: boolean) => void;
    onDiagramUndo?: () => void;
    onDiagramRedo?: () => void;
    // Canvas zoom (spec docs/superpowers/specs/2026-09-12-infinite-canvas-
    // design.md section 3). onZoomIn/onZoomOut/onZoomReset are Cmd/Ctrl
    // chords that double as the browser's own page-zoom shortcut, so - like
    // onToggleUi/onToggleChat/onTogglePanelCollapsed above - they fire and
    // preventDefault even while a text field, select or dialog owns the
    // interaction (the browser must never zoom the page instead). See each
    // shortcut's `always` flag in lib/shortcuts.ts, which is what actually
    // decides this now rather than where a check sits in this function.
    // onZoomToFit/onZoomToSelection are plain Shift+digit chords with no
    // such conflict, and every digit already types a real character while
    // typing (Shift+1 is "!"), so those two stay guarded like every other
    // plain-key shortcut.
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onZoomReset?: () => void;
    onZoomToFit?: () => void;
    onZoomToSelection?: () => void;
    // D/P/E (spec docs/superpowers/specs/2026-09-13-shortcuts-and-elements-
    // design.md section 2): switches the right panel to that tab, expanding
    // it first if minimized - both are WorkbenchShell's job, same division
    // as every other callback here. Guarded like every other bare letter.
    onSelectPanelTab?: (mode: PanelMode) => void;
    // V: leaves the comment tool (and, once it exists, the diagram tool) -
    // the pointer is the default state, not a tool of its own to enter.
    onPointerTool?: () => void;
    // Cmd+R (spec section 2, "always, preventDefault"): presents the
    // focused screen the same way the top bar's Present link does. Always,
    // like the zoom chords above, since it deliberately takes over the
    // browser's own reload shortcut inside the editor (Cmd+Shift+R is left
    // alone - see matchShortcut in lib/shortcuts.ts).
    onPresent?: () => void;
    // Shift+N: adds a screen, same as the screens strip's own "New screen"
    // button.
    onAddScreen?: () => void;
    // Cmd+Shift+]/[ (spec docs/superpowers/specs/2026-09-12-pages-design.md
    // section 3): goes to the next/previous page, guarded like every other
    // plain (non-`always`) shortcut - never fires inside a text field,
    // select or dialog.
    onPageNext?: () => void;
    onPagePrev?: () => void;
    // "?": opens the shortcuts dialog (components/workbench/shortcuts-
    // overlay.tsx), the same action the top bar's ⌘ button and its overflow
    // menu item perform.
    onOpenShortcuts?: () => void;
    // Shift+G / Cmd+' (spec docs/superpowers/specs/2026-09-13-grid-
    // snapping-alignment-design.md section 5): toggles the focused screen's
    // own layout grid, or the canvas's per-browser pixel grid - guarded
    // like every other bare-letter/Mod-chord shortcut of its own kind (see
    // each id's own `always` in lib/shortcuts.ts).
    onToggleLayoutGrid?: () => void;
    onTogglePixelGrid?: () => void;
  } = {},
): void {
  const {
    onToggleUi,
    onToggleChat,
    onTogglePanelCollapsed,
    onToggleCommentMode,
    commentMode,
    onExitCommentMode,
    onDiagramTool,
    diagramToolActive,
    onExitDiagramTool,
    diagramSelectionActive,
    onDeselectDiagram,
    frameSelectionActive,
    onClearFrameSelection,
    onDiagramDelete,
    onDiagramDuplicate,
    onDiagramSelectAll,
    onDiagramNudge,
    onFrameNudge,
    onDiagramUndo,
    onDiagramRedo,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onZoomToFit,
    onZoomToSelection,
    onSelectPanelTab,
    onPointerTool,
    onPresent,
    onAddScreen,
    onPageNext,
    onPagePrev,
    onOpenShortcuts,
    onToggleLayoutGrid,
    onTogglePixelGrid,
  } = options;
  const { actions, query } = useEditor();
  // The frame lives in its own document once Stage has a CanvasFrame
  // (canvas-frame.tsx); a keydown while focus is inside it never reaches the
  // parent window (keydown does not cross document boundaries), so the same
  // handler is attached there too. Attaching it twice never double-handles a
  // single keypress: each keydown is dispatched to exactly one window (the
  // one that has focus), never both.
  const canvasDocument = useCanvasDocument();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Which shortcut (if any) this raw event corresponds to lives in
      // lib/shortcuts.ts, shared with the overlay/dialog and the top bar's
      // zoom menu so none of them can drift from what this handler actually
      // does. `always` (also from the registry) is the only thing that
      // decides whether a shortcut still fires while a text field, select or
      // dialog owns the interaction - everything below this point is what
      // each id DOES, not which keys reach it.
      const id = matchShortcut(event);
      if (!id) return;
      if (!SHORTCUTS_BY_ID[id]?.always && isEditableTarget(event.target)) return;

      switch (id) {
        case 'toggle-ui':
          event.preventDefault();
          onToggleUi?.();
          return;

        case 'chat-toggle-mod':
        case 'chat-toggle':
          event.preventDefault();
          onToggleChat?.();
          return;

        case 'panel-collapse':
          event.preventDefault();
          onTogglePanelCollapsed?.();
          return;

        case 'zoom-in':
          event.preventDefault();
          onZoomIn?.();
          return;

        case 'zoom-out':
          event.preventDefault();
          onZoomOut?.();
          return;

        case 'zoom-reset':
          event.preventDefault();
          onZoomReset?.();
          return;

        case 'present':
          event.preventDefault();
          onPresent?.();
          return;

        case 'zoom-to-fit':
          event.preventDefault();
          onZoomToFit?.();
          return;

        case 'zoom-to-selection':
          event.preventDefault();
          onZoomToSelection?.();
          return;

        case 'undo':
          event.preventDefault();
          if (diagramSelectionActive) {
            onDiagramUndo?.();
            return;
          }
          if (query.history.canUndo()) actions.history.undo();
          return;

        case 'redo':
          event.preventDefault();
          if (diagramSelectionActive) {
            onDiagramRedo?.();
            return;
          }
          if (query.history.canRedo()) actions.history.redo();
          return;

        case 'diagram-duplicate':
          if (!diagramSelectionActive || isSeparatorTarget(event.target)) return;
          event.preventDefault();
          onDiagramDuplicate?.();
          return;

        case 'diagram-select-all':
          if (!diagramSelectionActive && !diagramToolActive) return;
          event.preventDefault();
          onDiagramSelectAll?.();
          return;

        case 'diagram-nudge-up':
        case 'diagram-nudge-down':
        case 'diagram-nudge-left':
        case 'diagram-nudge-right':
        case 'diagram-nudge-up-shift':
        case 'diagram-nudge-down-shift':
        case 'diagram-nudge-left-shift':
        case 'diagram-nudge-right-shift': {
          if (isSeparatorTarget(event.target)) return;
          const direction = id.replace(/^diagram-nudge-/, '').replace(/-shift$/, '') as 'up' | 'down' | 'left' | 'right';
          const big = id.endsWith('-shift');
          if (diagramSelectionActive) {
            event.preventDefault();
            onDiagramNudge?.(direction, big);
            return;
          }
          if (frameSelectionActive) {
            event.preventDefault();
            onFrameNudge?.(direction, big);
            return;
          }
          return;
        }

        case 'tool-comment':
          event.preventDefault();
          onToggleCommentMode?.();
          return;

        case 'tool-diagram':
          event.preventDefault();
          onDiagramTool?.();
          return;

        case 'panel-design':
          onSelectPanelTab?.('design');
          return;

        case 'panel-prototype':
          onSelectPanelTab?.('prototype');
          return;

        case 'panel-elements':
          onSelectPanelTab?.('components');
          return;

        case 'tool-pointer':
          onPointerTool?.();
          return;

        case 'screen-new':
          onAddScreen?.();
          return;

        case 'page-next':
          // preventDefault: Cmd+Shift+]/Ctrl+Shift+] is a real browser
          // shortcut too (next tab, in Chrome and Safari on Mac) - the
          // editor must win when the chord legitimately reaches here (it
          // never does from inside a text field or dialog - see this
          // shortcut's own `always` being unset in lib/shortcuts.ts, unlike
          // the zoom/present chords above).
          event.preventDefault();
          onPageNext?.();
          return;

        case 'page-prev':
          event.preventDefault();
          onPagePrev?.();
          return;

        case 'shortcuts-help':
          onOpenShortcuts?.();
          return;

        case 'layout-grid-toggle':
          onToggleLayoutGrid?.();
          return;

        case 'pixel-grid-toggle':
          event.preventDefault();
          onTogglePixelGrid?.();
          return;

        case 'escape':
          if (commentMode) {
            onExitCommentMode?.();
            return;
          }
          if (diagramToolActive) {
            onExitDiagramTool?.();
            return;
          }
          if (diagramSelectionActive) {
            onDeselectDiagram?.();
            return;
          }
          if (frameSelectionActive) {
            onClearFrameSelection?.();
            return;
          }
          actions.selectNode();
          return;

        case 'delete-layer': {
          if (diagramSelectionActive) {
            if (isSeparatorTarget(event.target)) return;
            event.preventDefault();
            onDiagramDelete?.();
            return;
          }
          // Read the selection live from `query` rather than from a hook snapshot: Craft.js's
          // `useEditor` collector re-renders lag behind `query`'s live state by a render or more,
          // so a snapshot id can still be the previously selected node when this fires.
          const state = query.getState();
          const selectedId = selectedIdFrom(state);
          if (!selectedId || selectedId === ROOT_NODE) return;
          const node = state.nodes[selectedId];
          if (node && ZONE_TYPES.has(node.data.name)) return;
          event.preventDefault();
          actions.delete(selectedId);
          return;
        }

        default:
          // Ids with no case above are not wired to a handler yet - new
          // shortcuts land in later commits. This is a no-op: nothing
          // before this point called
          // preventDefault, so the key's default browser behavior proceeds
          // untouched.
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    canvasDocument?.window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      canvasDocument?.window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    actions,
    query,
    onToggleUi,
    onToggleChat,
    onTogglePanelCollapsed,
    onToggleCommentMode,
    commentMode,
    onExitCommentMode,
    onDiagramTool,
    diagramToolActive,
    onExitDiagramTool,
    diagramSelectionActive,
    onDeselectDiagram,
    frameSelectionActive,
    onClearFrameSelection,
    onDiagramDelete,
    onDiagramDuplicate,
    onDiagramSelectAll,
    onDiagramNudge,
    onFrameNudge,
    onDiagramUndo,
    onDiagramRedo,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onZoomToFit,
    onZoomToSelection,
    onSelectPanelTab,
    onPointerTool,
    onPresent,
    onAddScreen,
    onPageNext,
    onPagePrev,
    onOpenShortcuts,
    onToggleLayoutGrid,
    onTogglePixelGrid,
    canvasDocument,
  ]);
}
