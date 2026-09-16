import { defaultTable } from './table';
import { nanoid } from 'nanoid';
import { snapToGrid, type Point } from './geometry';
import { NODE_KINDS, type DiagramNode, type DiagramNodeKind } from './store';

export const DIAGRAM_SHAPE_MIME = 'application/x-dreamscape-diagram-shape';
export const DIAGRAM_DRAG_EVENT = 'dreamscape:diagram-drag';
export const DEFAULT_DIAGRAM_SIZE: Record<DiagramNodeKind, { width: number; height: number }> = {
  rect: { width: 160, height: 80 },
  rounded: { width: 160, height: 80 },
  decision: { width: 160, height: 100 },
  terminal: { width: 140, height: 56 },
  text: { width: 140, height: 40 },
  note: { width: 140, height: 100 },
  table: { width: 480, height: 192 },
};

export function readDiagramShape(value: string): DiagramNodeKind | null {
  return NODE_KINDS.find(kind => kind === value) ?? null;
}

export function createDiagramNode(kind: DiagramNodeKind, center: Point): DiagramNode {
  const size = DEFAULT_DIAGRAM_SIZE[kind];
  return {
    id: nanoid(10), kind, ...size,
    x: snapToGrid(center.x - size.width / 2),
    y: snapToGrid(center.y - size.height / 2),
    ...(kind === 'text' ? { textColor: 'blue' as const } : {}),
    ...(kind === 'table' ? { table: defaultTable() } : {}),
    color: 'neutral', text: kind === 'text' ? 'Text' : kind === 'note' ? 'Note' : '',
  };
}

export function startDiagramDrag(dataTransfer: DataTransfer, kind: DiagramNodeKind): void {
  dataTransfer.setData(DIAGRAM_SHAPE_MIME, kind);
  dataTransfer.effectAllowed = 'copy';
  window.dispatchEvent(new CustomEvent(DIAGRAM_DRAG_EVENT, { detail: kind }));
}

export function endDiagramDrag(): void {
  window.dispatchEvent(new CustomEvent(DIAGRAM_DRAG_EVENT, { detail: null }));
}
