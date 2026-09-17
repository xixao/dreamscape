'use client';

import { DefaultEventHandlers, ROOT_NODE, useEditor, type EditorState } from '@craftjs/core';
import { useEffect } from 'react';
import { ZONE_TYPES } from '@/components/blocks/registry';

export function selectedIdFrom(state: EditorState): string | null {
  const [first] = state.events.selected;
  return first ?? null;
}

export interface SelectedNode {
  id: string | null;
  type: string | null;
  displayName: string | null;
  parentId: string | null;
  isRoot: boolean;
  isZone: boolean;
}

export function useSelectedNode(): SelectedNode {
  const { id, type, displayName, parentId } = useEditor((state) => {
    const selectedId = selectedIdFrom(state);
    const node = selectedId ? state.nodes[selectedId] : null;
    return {
      id: node ? selectedId : null,
      type: node ? node.data.name : null,
      displayName: node ? node.data.displayName || node.data.name : null,
      parentId: node ? (node.data.parent ?? null) : null,
    };
  });
  return {
    id,
    type,
    displayName,
    parentId,
    isRoot: id === ROOT_NODE,
    isZone: type !== null && ZONE_TYPES.has(type),
  };
}

export function useZoneRedirect(): void {
  const { actions, redirects } = useEditor(state => {
    const selected = [...state.events.selected];
    const normalized = [...new Set(selected.map(id => {
      const node = state.nodes[id];
      return node && ZONE_TYPES.has(node.data.name) && node.data.parent ? node.data.parent : id;
    }))];
    return { redirects: selected.some((id, index) => id !== normalized[index]) ? JSON.stringify(normalized) : null };
  });
  useEffect(() => {
    if (redirects) actions.selectNode(JSON.parse(redirects));
  }, [actions, redirects]);
}

/** Use the same additive selection gesture in both editing workspaces. */
export function selectionHandlers(store: NonNullable<ConstructorParameters<typeof DefaultEventHandlers>[0]>['store']) {
  class SelectionHandlers extends DefaultEventHandlers {
    handlers() {
      const handlers = super.handlers();
      return { ...handlers, select: (element: HTMLElement, id: string) => {
        // Layer-list selection uses actions directly. Refresh Craft's click
        // baseline so Shift-click can also remove an item selected in Layers.
        const sync = () => { this.currentSelectedElementIds = store.query.getEvent('selected').all(); };
        element.addEventListener('mousedown', sync, true);
        const cleanup = handlers.select(element, id);
        return () => { element.removeEventListener('mousedown', sync, true); cleanup(); };
      } };
    }
  }
  return new SelectionHandlers({ store, removeHoverOnMouseleave: true, isMultiSelectEnabled: event => event.shiftKey || event.metaKey || event.ctrlKey });
}
