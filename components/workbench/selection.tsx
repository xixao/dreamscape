'use client';

import { ROOT_NODE, useEditor, type EditorState } from '@craftjs/core';
import { useEffect } from 'react';
import { ZONE_TYPES } from '@/components/blocks/registry';

export function selectedIdFrom(state: EditorState): string | null {
  const [first] = state.events.selected;
  return first ?? null;
}

export interface SelectedNode {
  id: string | null;
  type: string | null;
  parentId: string | null;
  isRoot: boolean;
  isZone: boolean;
}

export function useSelectedNode(): SelectedNode {
  const { id, type, parentId } = useEditor((state) => {
    const selectedId = selectedIdFrom(state);
    const node = selectedId ? state.nodes[selectedId] : null;
    return {
      id: node ? selectedId : null,
      type: node ? node.data.name : null,
      parentId: node ? (node.data.parent ?? null) : null,
    };
  });
  return {
    id,
    type,
    parentId,
    isRoot: id === ROOT_NODE,
    isZone: type !== null && ZONE_TYPES.has(type),
  };
}

export function useZoneRedirect(): void {
  const { actions } = useEditor();
  const { isZone, parentId } = useSelectedNode();
  useEffect(() => {
    if (isZone && parentId) actions.selectNode(parentId);
  }, [actions, isZone, parentId]);
}
