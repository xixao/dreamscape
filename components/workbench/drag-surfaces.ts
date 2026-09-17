import type { Node, SerializedNodes } from '@craftjs/core';
export type DragSurface = {
    id: string;
    name: string;
    document: Document;
    nodes: () => Record<string, Node>;
    accept?: (parent: string, moving: Node[]) => boolean;
    serialized: () => SerializedNodes;
};
export const dragSurfaces = new Map<string, DragSurface>();
export const DRAG_MOVE_TO = 'dreamscape-move-to';
export const DRAG_TARGET = 'dreamscape-drag-target';
