'use client';

import { ROOT_NODE, useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { ZONE_TYPES } from '@/components/blocks/registry';
import { selectedIdFrom } from './selection';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  return target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

export function useWorkbenchKeyboard(): void {
  const { actions, query } = useEditor();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, query]);
}
