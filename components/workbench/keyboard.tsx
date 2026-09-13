'use client';

import { ROOT_NODE, useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { ZONE_TYPES } from '@/components/blocks/registry';
import { selectedIdFrom } from './selection';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

// A popup or dialog owns the interaction while it is open: Delete/Backspace should
// remove text or a list item inside it, not the selected block behind it, and
// Escape/undo should be free to close the popup instead of touching the stage.
const POPUP_SELECTOR =
  '[role="listbox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="combobox"], [data-radix-popper-content-wrapper]';

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]') !== null) {
    return true;
  }
  return target.closest(POPUP_SELECTOR) !== null;
}

export function useWorkbenchKeyboard(
  options: {
    onToggleUi?: () => void;
    // Comment tool (docs/superpowers/specs/2026-09-12-folders-and-comments-design.md
    // section 5): `onToggleCommentMode` fires on a bare "c"; `commentMode`
    // tells Escape whether to leave the tool (via `onExitCommentMode`)
    // instead of its usual deselect. The toggle logic itself lives with
    // whoever owns the `commentMode` state (WorkbenchShell), same as
    // `onToggleUi` never owns `uiHidden` itself.
    onToggleCommentMode?: () => void;
    commentMode?: boolean;
    onExitCommentMode?: () => void;
  } = {},
): void {
  const { onToggleUi, onToggleCommentMode, commentMode, onExitCommentMode } = options;
  const { actions, query } = useEditor();

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
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, query, onToggleUi, onToggleCommentMode, commentMode, onExitCommentMode]);
}
