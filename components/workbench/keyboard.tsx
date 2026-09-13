'use client';

import { ROOT_NODE, useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { ZONE_TYPES } from '@/components/blocks/registry';
import { isElementLike } from '@/lib/dom';
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

// Cmd+=/Cmd+- (spec docs/superpowers/specs/2026-09-12-infinite-canvas-design.md
// section 3): `event.key` alone already covers a numpad Add/Subtract press
// (neither has a distinct shifted variant, so their `key` is always '+'/'-'
// regardless of Shift) but `event.code` is checked too, for a keyboard/OS
// combination that reports something unexpected for `key`. `=`/`+` share one
// physical key on a US layout (Shift changes which character is produced,
// not which shortcut the user meant), same for `-`/`_`.
const ZOOM_IN_KEYS = new Set(['=', '+']);
const ZOOM_OUT_KEYS = new Set(['-', '_']);
const ZOOM_IN_CODES = new Set(['Equal', 'NumpadAdd']);
const ZOOM_OUT_CODES = new Set(['Minus', 'NumpadSubtract']);

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
    // Comment tool (docs/superpowers/specs/2026-09-12-folders-and-comments-design.md
    // section 5): `onToggleCommentMode` fires on a bare "c"; `commentMode`
    // tells Escape whether to leave the tool (via `onExitCommentMode`)
    // instead of its usual deselect. The toggle logic itself lives with
    // whoever owns the `commentMode` state (WorkbenchShell), same as
    // `onToggleUi` never owns `uiHidden` itself.
    onToggleCommentMode?: () => void;
    commentMode?: boolean;
    onExitCommentMode?: () => void;
    // Canvas zoom (spec docs/superpowers/specs/2026-09-12-infinite-canvas-
    // design.md section 3). onZoomIn/onZoomOut/onZoomReset are Cmd/Ctrl
    // chords that double as the browser's own page-zoom shortcut, so - like
    // onToggleUi/onToggleChat/onTogglePanelCollapsed above - they fire and
    // preventDefault even while a text field, select or dialog owns the
    // interaction (the browser must never zoom the page instead).
    // onZoomToFit/onZoomToSelection are plain Shift+digit chords with no
    // such conflict, and every digit already types a real character while
    // typing (Shift+1 is "!"), so those two stay after the editable-target
    // guard like every other plain-key shortcut.
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onZoomReset?: () => void;
    onZoomToFit?: () => void;
    onZoomToSelection?: () => void;
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
      // Figma's Show/Hide UI. Checked before the editable-target and popup
      // guards below so the shortcut still works while a text field, select
      // or dialog owns the interaction.
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault();
        onToggleUi?.();
        return;
      }

      // Chat panel toggle, same precedence as Show/Hide UI above: it must
      // still work while a text field, select or dialog owns the
      // interaction (in particular, from inside the chat composer itself).
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        onToggleChat?.();
        return;
      }

      // Minimize/expand the right panel, same precedence as above.
      if ((event.metaKey || event.ctrlKey) && event.key === '.') {
        event.preventDefault();
        onTogglePanelCollapsed?.();
        return;
      }

      // Canvas zoom step in/out and reset - same precedence as above (these
      // double as the browser's own page-zoom shortcut, which must never
      // fire instead).
      if ((event.metaKey || event.ctrlKey) && (ZOOM_IN_KEYS.has(event.key) || ZOOM_IN_CODES.has(event.code))) {
        event.preventDefault();
        onZoomIn?.();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (ZOOM_OUT_KEYS.has(event.key) || ZOOM_OUT_CODES.has(event.code))) {
        event.preventDefault();
        onZoomOut?.();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '0') {
        event.preventDefault();
        onZoomReset?.();
        return;
      }

      if (isEditableTarget(event.target)) return;

      // Zoom to fit / zoom to selection: plain Shift+digit chords, checked
      // by `code` (not `key`, which reports "!"/"@" once Shift changes the
      // produced character) so they are not layout- or shift-state-fragile.
      // After the editable-target guard, unlike the zoom shortcuts above:
      // both digits still type a real character in a text field.
      if (event.shiftKey && event.code === 'Digit1') {
        event.preventDefault();
        onZoomToFit?.();
        return;
      }
      if (event.shiftKey && event.code === 'Digit2') {
        event.preventDefault();
        onZoomToSelection?.();
        return;
      }

      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          if (query.history.canRedo()) actions.history.redo();
        } else if (query.history.canUndo()) {
          actions.history.undo();
        }
        return;
      }

      // Bare "c" only - Cmd/Ctrl+C stays the browser/OS copy shortcut.
      if (!modifier && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        onToggleCommentMode?.();
        return;
      }

      if (event.key === 'Escape') {
        if (commentMode) {
          onExitCommentMode?.();
          return;
        }
        actions.selectNode();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Read the selection live from `query` rather than from a hook snapshot: Craft.js's
        // `useEditor` collector re-renders lag behind `query`'s live state by a render or more,
        // so a snapshot id can still be the previously selected node when this fires.
        const state = query.getState();
        const id = selectedIdFrom(state);
        if (!id || id === ROOT_NODE) return;
        const node = state.nodes[id];
        if (node && ZONE_TYPES.has(node.data.name)) return;
        event.preventDefault();
        actions.delete(id);
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
    canvasDocument,
  ]);
}
