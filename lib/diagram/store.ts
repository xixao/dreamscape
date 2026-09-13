// The diagram document model and its reducer (spec docs/superpowers/specs/
// 2026-09-13-diagrams-design.md sections 2 and 4): a pure, fully unit-tested
// reducer over `{ nodes, edges, selection, history }`, the same "own state,
// own history" shape Craft.js gives the block canvas, but scoped to one
// page's diagram and never touching Craft at all. `DiagramData` (nodes +
// edges only, no selection/history) is the shape persisted per page - see
// lib/files/validate.ts's validateDiagram and Page.diagram.
//
// Every action here is pure and deterministic: nothing generates a random
// id or reads the clock, so `add`/`connect`/`duplicate` all take whatever
// id(s) the caller already minted (nanoid(10), same convention as every
// other id in this app) rather than making one internally - that is what
// keeps this module trivially testable and keeps id generation exactly
// where the rest of the codebase already puts it (see e.g. addScreen in
// components/workbench/workbench.tsx).

import { bounds, snapToGrid, type Box, type Side } from './geometry';

export type { Side } from './geometry';

// Declared as `as const` tuples (rather than a plain union type plus a
// separately-typed array) so both lib/files/http.ts's zod schemas and
// lib/files/validate.ts's membership checks can consume the very same
// runtime array with full literal-type inference - a `z.enum(NODE_KINDS)`
// only narrows to the real union when NODE_KINDS is itself a const tuple.
export const NODE_KINDS = ['rect', 'rounded', 'decision', 'terminal', 'text', 'note'] as const;
export type DiagramNodeKind = (typeof NODE_KINDS)[number];

export const DIAGRAM_COLORS = ['neutral', 'blue', 'green', 'amber', 'red', 'violet'] as const;
export type DiagramColor = (typeof DIAGRAM_COLORS)[number];

export const CONNECTOR_KINDS = ['straight', 'step', 'curve'] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export const ARROW_KINDS = ['end', 'both', 'none'] as const;
export type ArrowKind = (typeof ARROW_KINDS)[number];

export interface DiagramNode {
  id: string;
  kind: DiagramNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: DiagramColor;
}

// One end of a connector: either a diagram node or a frame (screen) - never
// both, per the spec's model ("a frame can be a source or target"). `side`
// is the handle it leaves/arrives from; omitted, a renderer falls back to
// geometry.ts's anchorOnBox to pick one live from the other endpoint's
// position (useful for an edge stored before a side was ever chosen).
export interface EdgeEndpoint {
  nodeId?: string;
  screenId?: string;
  side?: Side;
}

export interface DiagramEdge {
  id: string;
  source: EdgeEndpoint;
  target: EdgeEndpoint;
  kind: ConnectorKind;
  arrow: ArrowKind;
  label?: string;
}

/** The persisted shape: `pages[].diagram` (lib/files/validate.ts). */
export interface DiagramData {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export type DiagramSelectionItem = { type: 'node'; id: string } | { type: 'edge'; id: string };
export type DiagramSelection = DiagramSelectionItem[];

export type DiagramSnapshot = DiagramData;

export interface DiagramHistory {
  past: DiagramSnapshot[];
  future: DiagramSnapshot[];
}

export interface DiagramState extends DiagramData {
  selection: DiagramSelection;
  history: DiagramHistory;
}

// Inline text/label cap (spec: "text up to 500 chars"; palette behaviour:
// "max 500 chars").
export const MAX_TEXT_LENGTH = 500;
// Undo depth (spec section 3: "100 steps").
export const HISTORY_LIMIT = 100;
// Cmd+D's offset for a duplicated shape (spec: "16 px offset").
export const DUPLICATE_OFFSET = 16;
// A shape can never resize down to zero or negative (validateDiagram's own
// "positive sizes" rule) - one grid unit is the smallest useful shape.
export const MIN_SIZE = 8;

export function createEmptyDiagramData(): DiagramData {
  return { nodes: [], edges: [] };
}

export function createInitialDiagramState(data: DiagramData = createEmptyDiagramData()): DiagramState {
  return { nodes: data.nodes, edges: data.edges, selection: [], history: { past: [], future: [] } };
}

export type DiagramAction =
  | { type: 'add'; node: DiagramNode }
  | { type: 'move'; ids: string[]; dx: number; dy: number }
  // `x`/`y`, when given, reposition the node in the SAME action - a corner
  // resize (nw/ne/sw) moves the box's top-left as well as its size, and
  // without this the diagram layer had to dispatch a second, separate
  // `move` right after, splitting one drag into two undo steps. Omitted
  // (not just equal to the current value) for a plain width/height resize,
  // or a resize from the bottom-right corner, which never move the box at
  // all - see diagram-layer.tsx's endResize.
  | { type: 'resize'; id: string; width: number; height: number; x?: number; y?: number }
  | { type: 'setText'; id: string; text: string }
  | { type: 'setColor'; id: string; color: DiagramColor }
  | { type: 'setKind'; id: string; kind: DiagramNodeKind | ConnectorKind }
  | { type: 'setArrow'; id: string; arrow: ArrowKind }
  | { type: 'connect'; edge: DiagramEdge }
  | { type: 'disconnect'; id: string }
  | { type: 'delete'; ids: string[] }
  | { type: 'duplicate'; pairs: { sourceId: string; newId: string }[] }
  | { type: 'select'; selection: DiagramSelection }
  | { type: 'clearSelection' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; data: DiagramData };

function endpointKey(endpoint: EdgeEndpoint): string {
  if (endpoint.nodeId) return `node:${endpoint.nodeId}`;
  if (endpoint.screenId) return `screen:${endpoint.screenId}`;
  return '';
}

export type ConnectionValidation = { ok: true } | { ok: false; reason: string };

/**
 * The three connect rules the spec names (section 4): both ends present, no
 * self-connection, and no duplicate edge between the same two endpoints and
 * sides. Exported so a caller (the diagram layer, mid-drag) can preflight a
 * connection before ever dispatching it, not just have the reducer silently
 * refuse it.
 */
export function validateConnection(state: Pick<DiagramData, 'edges'>, edge: DiagramEdge): ConnectionValidation {
  const sourceKey = endpointKey(edge.source);
  const targetKey = endpointKey(edge.target);
  if (!sourceKey || !targetKey) {
    return { ok: false, reason: 'a connector needs both a source and a target' };
  }
  if (sourceKey === targetKey) {
    return { ok: false, reason: 'cannot connect a shape or frame to itself' };
  }
  const duplicate = state.edges.some(
    (existing) =>
      endpointKey(existing.source) === sourceKey &&
      (existing.source.side ?? null) === (edge.source.side ?? null) &&
      endpointKey(existing.target) === targetKey &&
      (existing.target.side ?? null) === (edge.target.side ?? null),
  );
  if (duplicate) return { ok: false, reason: 'a connector already joins these two points' };
  return { ok: true };
}

function clampText(text: string): string {
  return text.slice(0, MAX_TEXT_LENGTH);
}

function snapSize(value: number): number {
  return Math.max(MIN_SIZE, snapToGrid(value));
}

/** Pushes `{ nodes, edges }` of the state BEFORE this edit onto `past` (capped at HISTORY_LIMIT) and clears `future` - every action that changes the document, other than selection/undo/redo/load, commits through this. */
function commit(state: DiagramState, next: DiagramData, selection: DiagramSelection = state.selection): DiagramState {
  const past = [...state.history.past, { nodes: state.nodes, edges: state.edges }].slice(-HISTORY_LIMIT);
  return { nodes: next.nodes, edges: next.edges, selection, history: { past, future: [] } };
}

function pruneSelection(selection: DiagramSelection, removedIds: ReadonlySet<string>): DiagramSelection {
  const pruned = selection.filter((item) => !removedIds.has(item.id));
  return pruned.length === selection.length ? selection : pruned;
}

export function diagramReducer(state: DiagramState, action: DiagramAction): DiagramState {
  switch (action.type) {
    case 'add': {
      if (state.nodes.some((n) => n.id === action.node.id)) return state;
      return commit(state, { nodes: [...state.nodes, action.node], edges: state.edges }, [
        { type: 'node', id: action.node.id },
      ]);
    }

    case 'move': {
      const ids = new Set(action.ids);
      let changed = false;
      const nodes = state.nodes.map((n) => {
        if (!ids.has(n.id)) return n;
        changed = true;
        return { ...n, x: snapToGrid(n.x + action.dx), y: snapToGrid(n.y + action.dy) };
      });
      if (!changed) return state;
      return commit(state, { nodes, edges: state.edges });
    }

    case 'resize': {
      const index = state.nodes.findIndex((n) => n.id === action.id);
      if (index === -1) return state;
      const nodes = [...state.nodes];
      const current = nodes[index];
      nodes[index] = {
        ...current,
        width: snapSize(action.width),
        height: snapSize(action.height),
        x: action.x === undefined ? current.x : snapToGrid(action.x),
        y: action.y === undefined ? current.y : snapToGrid(action.y),
      };
      return commit(state, { nodes, edges: state.edges });
    }

    case 'setText': {
      const text = clampText(action.text);
      if (state.nodes.some((n) => n.id === action.id)) {
        const nodes = state.nodes.map((n) => (n.id === action.id ? { ...n, text } : n));
        return commit(state, { nodes, edges: state.edges });
      }
      if (state.edges.some((e) => e.id === action.id)) {
        const edges = state.edges.map((e) => (e.id === action.id ? { ...e, label: text } : e));
        return commit(state, { nodes: state.nodes, edges });
      }
      return state;
    }

    case 'setColor': {
      const index = state.nodes.findIndex((n) => n.id === action.id);
      if (index === -1) return state;
      const nodes = [...state.nodes];
      nodes[index] = { ...nodes[index], color: action.color };
      return commit(state, { nodes, edges: state.edges });
    }

    case 'setKind': {
      const nodeIndex = state.nodes.findIndex((n) => n.id === action.id);
      if (nodeIndex !== -1) {
        const nodes = [...state.nodes];
        nodes[nodeIndex] = { ...nodes[nodeIndex], kind: action.kind as DiagramNodeKind };
        return commit(state, { nodes, edges: state.edges });
      }
      const edgeIndex = state.edges.findIndex((e) => e.id === action.id);
      if (edgeIndex !== -1) {
        const edges = [...state.edges];
        edges[edgeIndex] = { ...edges[edgeIndex], kind: action.kind as ConnectorKind };
        return commit(state, { nodes: state.nodes, edges });
      }
      return state;
    }

    case 'setArrow': {
      const index = state.edges.findIndex((e) => e.id === action.id);
      if (index === -1) return state;
      const edges = [...state.edges];
      edges[index] = { ...edges[index], arrow: action.arrow };
      return commit(state, { nodes: state.nodes, edges });
    }

    case 'connect': {
      if (!validateConnection(state, action.edge).ok) return state;
      return commit(state, { nodes: state.nodes, edges: [...state.edges, action.edge] });
    }

    case 'disconnect': {
      if (!state.edges.some((e) => e.id === action.id)) return state;
      const edges = state.edges.filter((e) => e.id !== action.id);
      return commit(state, { nodes: state.nodes, edges }, pruneSelection(state.selection, new Set([action.id])));
    }

    case 'delete': {
      const removedIds = new Set(action.ids);
      const nodes = state.nodes.filter((n) => !removedIds.has(n.id));
      // An edge is removed if it was named directly, or if either endpoint
      // was a node that just got removed (spec: "delete removes attached
      // edges") - even when only that node's id, not the edge's own, was in
      // `ids`.
      const edges = state.edges.filter((e) => {
        if (removedIds.has(e.id)) return false;
        if (e.source.nodeId && removedIds.has(e.source.nodeId)) return false;
        if (e.target.nodeId && removedIds.has(e.target.nodeId)) return false;
        return true;
      });
      if (nodes.length === state.nodes.length && edges.length === state.edges.length) return state;
      const removedEdgeIds = new Set(
        state.edges.filter((e) => !edges.some((kept) => kept.id === e.id)).map((e) => e.id),
      );
      const selection = pruneSelection(state.selection, new Set([...removedIds, ...removedEdgeIds]));
      return commit(state, { nodes, edges }, selection);
    }

    case 'duplicate': {
      const copies: DiagramNode[] = [];
      const selection: DiagramSelection = [];
      for (const { sourceId, newId } of action.pairs) {
        const source = state.nodes.find((n) => n.id === sourceId);
        if (!source) continue;
        copies.push({ ...source, id: newId, x: source.x + DUPLICATE_OFFSET, y: source.y + DUPLICATE_OFFSET });
        selection.push({ type: 'node', id: newId });
      }
      if (copies.length === 0) return state;
      return commit(state, { nodes: [...state.nodes, ...copies], edges: state.edges }, selection);
    }

    case 'select':
      return { ...state, selection: action.selection };

    case 'clearSelection':
      return state.selection.length === 0 ? state : { ...state, selection: [] };

    case 'undo': {
      const { past, future } = state.history;
      if (past.length === 0) return state;
      const previous = past[past.length - 1];
      return {
        nodes: previous.nodes,
        edges: previous.edges,
        selection: [],
        history: { past: past.slice(0, -1), future: [{ nodes: state.nodes, edges: state.edges }, ...future] },
      };
    }

    case 'redo': {
      const { past, future } = state.history;
      if (future.length === 0) return state;
      const next = future[0];
      return {
        nodes: next.nodes,
        edges: next.edges,
        selection: [],
        history: {
          past: [...past, { nodes: state.nodes, edges: state.edges }].slice(-HISTORY_LIMIT),
          future: future.slice(1),
        },
      };
    }

    case 'load':
      return createInitialDiagramState(action.data);

    default:
      return state;
  }
}

/**
 * Removes every edge whose source or target references `screenId` - the
 * cleanup a screen leaving a page (deleted, or moved to a different page)
 * needs before that page's diagram is saved again: a dangling `screenId`
 * endpoint is exactly what lib/files/validate.ts's validateDiagramReferences
 * rejects a save for, and lib/persistence.ts's saver never retries a
 * non-409/5xx response - left behind, it wedges the file, repeating the same
 * rejection on every future autosave with no way to recover short of
 * reloading and losing unsaved work. Called from components/workbench/
 * workbench.tsx's deleteScreen and moveScreenToPage, in the same patch as
 * the screens array itself (deletePage needs no equivalent call: it removes
 * a page's own diagram along with every one of its screens together, and a
 * diagram edge's screenId can only ever reference a screen on that SAME
 * page, so there is no other page's diagram it could have left dangling).
 * Pure and non-mutating: returns `diagram` itself, unchanged, when nothing
 * referenced `screenId` at all, so a caller can cheaply tell whether
 * anything actually needs saving.
 */
export function pruneEdgesForScreen(diagram: DiagramData, screenId: string): DiagramData {
  const edges = diagram.edges.filter(
    (edge) => edge.source.screenId !== screenId && edge.target.screenId !== screenId,
  );
  return edges.length === diagram.edges.length ? diagram : { nodes: diagram.nodes, edges };
}

/**
 * The bounding box of every currently-selected NODE (edges have no box of
 * their own to contribute), or `null` when nothing - or only edges - is
 * selected. Used for the group-drag/resize affordance and, via
 * components/workbench/canvas.tsx, folded into Zoom to fit's own frame
 * bounds.
 */
export function selectionBounds(state: DiagramState): Box | null {
  const boxes = state.selection
    .filter((item): item is { type: 'node'; id: string } => item.type === 'node')
    .map((item) => state.nodes.find((n) => n.id === item.id))
    .filter((n): n is DiagramNode => n !== undefined);
  return bounds(boxes);
}
