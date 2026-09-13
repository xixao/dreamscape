'use client';

import { ROOT_NODE, useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { ZONE_TYPES } from '@/components/blocks/registry';
import { useCanvasDocument } from './canvas-frame';
import { selectedIdFrom } from './selection';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

// A popup or dialog owns the interaction while it is open: Delete/Backspace should
// remove text or a list item inside it, not the selected block behind it, and
// Escape/undo should be free to close the popup instead of touching the stage.
const POPUP_SELECTOR =
  '[role="listbox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="combobox"], [data-radix-popper-content-wrapper]';

// Duck-typed rather than `target instanceof HTMLElement`: with the frame now
// sometimes living in an iframe (canvas-frame.tsx), a keydown's target can be
// an element from that document's own realm, which has its own `HTMLElement`
// constructor - `instanceof` against the parent window's would silently
// return false for it even though it plainly is one (typing Delete into a
// text block inside the frame would fall through to deleting the block).
// Every DOM element, from any realm, has these same own/inherited members.
function isElementLike(target: EventTarget | null): target is HTMLElement {
  return !!target && typeof target === 'object' && 'tagName' in target && 'closest' in target;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!isElementLike(target)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]') !== null) {
    return true;
  }
  return target.closest(POPUP_SELECTOR) !== null;
}

export function useWorkbenchKeyboard(options: { onToggleUi?: () => void } = {}): void {
  const { onToggleUi } = options;
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

      if (isEditableTarget(event.target)) return;

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

      if (event.key === 'Escape') {
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
  }, [actions, query, onToggleUi, canvasDocument]);
}
