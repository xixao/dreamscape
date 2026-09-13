'use client';

import { ROOT_NODE, useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { ZONE_TYPES } from '@/components/blocks/registry';
import { isElementLike } from '@/lib/dom';
import { matchShortcut, SHORTCUTS_BY_ID } from '@/lib/shortcuts';
import type { PanelMode } from '@/lib/workbench/panel-store';
import { useCanvasDocument } from './canvas-frame';
import { selectedIdFrom } from './selection';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

// A popup or dialog owns the interaction while it is open: Delete/Backspace should
// remove text or a list item inside it, not the selected block behind it, and
// Escape/undo should be free to close the popup instead of touching the stage.
const POPUP_SELECTOR =
  '[role="listbox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="combobox"], [data-radix-popper-content-wrapper]';

// isElementLike (lib/dom.ts) is duck-typed rather than `target instanceof
// HTMLElement`: with the frame now sometimes living in an iframe
// (canvas-frame.tsx), a keydown's target can be an element from that
// document's own realm, which has its own `HTMLElement` constructor -
// `instanceof` against the parent window's would silently return false for
// it even though it plainly is one (typing Delete into a text block inside
// the frame would fall through to deleting the block).

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!isElementLike(target)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]') !== null) {
    return true;
  }
  return target.closest(POPUP_SELECTOR) !== null;
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
    // "?": opens the shortcuts sheet as a dialog, same content the Cmd-hold
    // overlay shows (components/workbench/shortcuts-overlay.tsx) and the
    // same action the top bar's overflow menu item performs.
    onOpenShortcuts?: () => void;
  } = {},
): void {
  const {
    onToggleUi,
    onToggleChat,
    onTogglePanelCollapsed,
    onToggleCommentMode,
    commentMode,
    onExitCommentMode,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onZoomToFit,
    onZoomToSelection,
    onSelectPanelTab,
    onPointerTool,
    onPresent,
    onAddScreen,
    onOpenShortcuts,
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
          if (query.history.canUndo()) actions.history.undo();
          return;

        case 'redo':
          event.preventDefault();
          if (query.history.canRedo()) actions.history.redo();
          return;

        case 'tool-comment':
          event.preventDefault();
          onToggleCommentMode?.();
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

        case 'shortcuts-help':
          onOpenShortcuts?.();
          return;

        case 'escape':
          if (commentMode) {
            onExitCommentMode?.();
            return;
          }
          actions.selectNode();
          return;

        case 'delete-layer': {
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
          // Ids with no case above are either not wired to a handler yet
          // (new shortcuts land in later commits) or, like 'tool-diagram',
          // registered for the overlay/README only on purpose. Either way,
          // this is a no-op: nothing before this point called
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
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onZoomToFit,
    onZoomToSelection,
    onSelectPanelTab,
    onPointerTool,
    onPresent,
    onAddScreen,
    onOpenShortcuts,
    canvasDocument,
  ]);
}
