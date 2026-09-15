'use client';
import { useEditor } from '@craftjs/core';
import { useEffect, useState } from 'react';

export function useSettledEditorState() {
  const { store, query } = useEditor();
  const [editorSnapshot, setEditorSnapshot] = useState(() => query.getState());
  useEffect(() => {
    let disposed = false;
    let pending = false;
    // Craft creates linked content nodes during Element's render. Its
    // synchronous collector must not set React state in another component.
    const schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (!disposed) setEditorSnapshot(query.getState());
      });
    };
    const unsubscribe = store.subscribe(state => ({ nodes: state.nodes, selected: state.events.selected }), schedule);
    schedule();
    return () => { disposed = true; unsubscribe(); };
  }, [store, query]);
  return editorSnapshot;
}
