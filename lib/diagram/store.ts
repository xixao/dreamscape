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
// quickAdd's gap between the source shape and its new neighbour (spec
// follow-up section 7, Build step 4: "64 px beyond the source").
export const QUICK_ADD_GAP = 64;

// Align/distribute (Matt's alignment-options follow-up, 2026-09-13): the
// six edges/centres a multi-selection can align to, and the two axes it can
// spread evenly along. `as const` tuples for the same reason as NODE_KINDS
// et al above - a future Design-panel alignment row (a different branch)
// can build its own UI straight off these exported arrays.
export const ALIGN_MODES = ['left', 'centerX', 'right', 'top', 'centerY', 'bottom'] as const;
export type AlignMode = (typeof ALIGN_MODES)[number];

export const DISTRIBUTE_AXES = ['horizontal', 'vertical'] as const;
export type DistributeAxis = (typeof DISTRIBUTE_AXES)[number];

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
  // `offset` defaults to a 16px-down-and-right offset (DUPLICATE_OFFSET) when
  // omitted, preserving Cmd+D's existing behaviour; the option-drag gesture
  // (diagram-layer.tsx) passes `{ x: 0, y: 0 }` so the copies start exactly
  // under the originals before the drag moves them. `edgePairs`, when given,
  // copies a connector alongside its nodes - but only the ones the reducer
  // itself confirms have BOTH endpoints among `pairs` (spec follow-up:
  // "Connectors between two duplicated shapes are duplicated too ... others
  // are not"); the caller still mints every new id (this module never
  // generates one), including for `edgePairs`.
  | {
      type: 'duplicate';
      pairs: { sourceId: string; newId: string }[];
      edgePairs?: { sourceId: string; newId: string }[];
      offset?: { x: number; y: number };
    }
  // Moves the given nodes to the end (`front`, painted last/on top - nodes
  // always render after edges in diagram-layer.tsx, so this only reorders
  // nodes relative to each other) or start (`back`) of the `nodes` array,
  // preserving their relative order among themselves and among the rest.
  // Build step 1: "reorder action (bringToFront / sendToBack by moving nodes
  // to the end or start of the array)".
  | { type: 'reorder'; ids: string[]; to: 'front' | 'back' }
  // Creates a same kind/colour/size node with empty text 64px beyond
  // `sourceId` on `side`, aligned with it on the cross axis, plus a `step`
  // connector from that side to the opposite side of the new node - the
  // quick-add hover circles (Build step 4). `newNodeId`/`newEdgeId` are
  // caller-minted, same convention as every other id here.
  | { type: 'quickAdd'; sourceId: string; side: Side; newNodeId: string; newEdgeId: string }
  // Aligns every node in `ids` to the bounding box of just those nodes (an
  // edge or centre, per `mode`), 8px-snapped. Matt's alignment follow-up.
  | { type: 'align'; ids: string[]; mode: AlignMode }
  // Spreads 3+ nodes in `ids` along `axis` so the gaps between them are
  // equal; the first and last (by position) stay put. Matt's alignment
  // follow-up.
  | { type: 'distribute'; ids: string[]; axis: DistributeAxis }
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


/** Pushes `{ nodes, edges }` of the state BEFORE this edit onto `past` (capped at HISTORY_LIMIT) and clears `future` - every action that changes the document, other than selection/undo/redo/load, commits through this. */
function commit(state: DiagramState, next: DiagramData, selection: DiagramSelection = state.selection): DiagramState {
  const past = [...state.history.past, { nodes: state.nodes, edges: state.edges }].slice(-HISTORY_LIMIT);
  return { nodes: next.nodes, edges: next.edges, selection, history: { past, future: [] } };
}

function opposite(side: Side): Side {
  switch (side) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
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

    // Adds the delta exactly - no snapping of its own (review finding 10,
    // Matt's nudge rule: a plain arrow key must move a diagram selection by
    // exactly 1px, not jump to the nearest 8px multiple). Snapping to the
    // grid is the CALLER's job now: the diagram layer snaps a drag's pointer
    // delta before dispatching (diagram-layer.tsx's endDrag), so a mouse
    // drag still lands on the grid, while a keyboard nudge dispatches its 1
    // or 8 px amount unsnapped, on purpose.
    case 'move': {
      const ids = new Set(action.ids);
      let changed = false;
      const nodes = state.nodes.map((n) => {
        if (!ids.has(n.id)) return n;
        changed = true;
        return { ...n, x: n.x + action.dx, y: n.y + action.dy };
      });
      if (!changed) return state;
      return commit(state, { nodes, edges: state.edges });
    }

    // Re-review finding 21: one rule across move/resize/duplicate - the
    // layer snaps a gesture's delta to the grid before it ever dispatches
    // (diagram-layer.tsx's handleResizeMove), so the live preview and the
    // landing box always agree; the reducer stores exactly what it is
    // given, same as move. MIN_SIZE is still floored here - a floor
    // against a degenerate (zero/negative) shape, not a grid snap, so it
    // stays a reducer-level invariant regardless of what called it.
    case 'resize': {
      const index = state.nodes.findIndex((n) => n.id === action.id);
      if (index === -1) return state;
      const nodes = [...state.nodes];
      const current = nodes[index];
      nodes[index] = {
        ...current,
        width: Math.max(MIN_SIZE, action.width),
        height: Math.max(MIN_SIZE, action.height),
        x: action.x === undefined ? current.x : action.x,
        y: action.y === undefined ? current.y : action.y,
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
      const offset = action.offset ?? { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET };
      const idMap: Record<string, string> = {};
      const copies: DiagramNode[] = [];
      const selection: DiagramSelection = [];
      for (const { sourceId, newId } of action.pairs) {
        const source = state.nodes.find((n) => n.id === sourceId);
        if (!source) continue;
        idMap[sourceId] = newId;
        // Re-review finding 20: exact offset, no re-snap - the caller (a
        // drag's already-snapped delta, or Cmd+D's plain 16px) already
        // decided the movement; re-snapping the RESULT here disagreed with
        // it the moment the source itself was off-grid.
        copies.push({ ...source, id: newId, x: source.x + offset.x, y: source.y + offset.y });
        selection.push({ type: 'node', id: newId });
      }
      if (copies.length === 0) return state;
      // A connector is copied only when the reducer itself confirms BOTH its
      // endpoints are node ids that just got a copy above - never just
      // because the caller happened to list it in edgePairs (defense in
      // depth, same as every other action here re-validating rather than
      // trusting its own caller).
      const copiedEdges: DiagramEdge[] = [];
      for (const { sourceId, newId } of action.edgePairs ?? []) {
        const original = state.edges.find((e) => e.id === sourceId);
        if (!original) continue;
        const newSourceId = original.source.nodeId ? idMap[original.source.nodeId] : undefined;
        const newTargetId = original.target.nodeId ? idMap[original.target.nodeId] : undefined;
        if (!newSourceId || !newTargetId) continue;
        copiedEdges.push({
          ...original,
          id: newId,
          source: { ...original.source, nodeId: newSourceId },
          target: { ...original.target, nodeId: newTargetId },
        });
      }
      return commit(state, { nodes: [...state.nodes, ...copies], edges: [...state.edges, ...copiedEdges] }, selection);
    }

    // Review finding 8: a no-op reorder (every id already at that end)
    // still pushed a history entry, so the next Cmd+Z appeared to do
    // nothing and threw away the redo stack - compare element-by-element
    // by reference (same guard shape as move's own `changed`) rather than
    // committing unconditionally whenever `ids` matched something.
    case 'reorder': {
      const idSet = new Set(action.ids);
      const targets = state.nodes.filter((n) => idSet.has(n.id));
      if (targets.length === 0) return state;
      const rest = state.nodes.filter((n) => !idSet.has(n.id));
      const nodes = action.to === 'front' ? [...rest, ...targets] : [...targets, ...rest];
      const changed = nodes.some((n, i) => n !== state.nodes[i]);
      if (!changed) return state;
      return commit(state, { nodes, edges: state.edges });
    }

    // Review finding 19: refuses an already-used newNodeId/newEdgeId, same
    // as `add` above - quickAdd previously did not.
    case 'quickAdd': {
      if (state.nodes.some((n) => n.id === action.newNodeId) || state.edges.some((e) => e.id === action.newEdgeId)) {
        return state;
      }
      const source = state.nodes.find((n) => n.id === action.sourceId);
      if (!source) return state;
      const { width, height } = source;
      let x = source.x;
      let y = source.y;
      switch (action.side) {
        case 'right':
          x = source.x + source.width + QUICK_ADD_GAP;
          break;
        case 'left':
          x = source.x - QUICK_ADD_GAP - width;
          break;
        case 'bottom':
          y = source.y + source.height + QUICK_ADD_GAP;
          break;
        case 'top':
          y = source.y - QUICK_ADD_GAP - height;
          break;
      }
      const newNode: DiagramNode = {
        id: action.newNodeId,
        kind: source.kind,
        x: snapToGrid(x),
        y: snapToGrid(y),
        width,
        height,
        text: '',
        color: source.color,
      };
      const newEdge: DiagramEdge = {
        id: action.newEdgeId,
        source: { nodeId: source.id, side: action.side },
        target: { nodeId: newNode.id, side: opposite(action.side) },
        kind: 'step',
        arrow: 'end',
      };
      return commit(state, { nodes: [...state.nodes, newNode], edges: [...state.edges, newEdge] }, [
        { type: 'node', id: newNode.id },
      ]);
    }

    // Review finding 8: aligning shapes that are already aligned still
    // pushed a history entry - track whether anything actually moved, same
    // `changed` guard shape as move/reorder above.
    case 'align': {
      const targets = action.ids
        .map((id) => state.nodes.find((n) => n.id === id))
        .filter((n): n is DiagramNode => n !== undefined);
      if (targets.length < 2) return state;
      const box = bounds(targets);
      if (!box) return state;
      const targetIds = new Set(targets.map((n) => n.id));
      let changed = false;
      const nodes = state.nodes.map((n) => {
        if (!targetIds.has(n.id)) return n;
        const axis: 'x' | 'y' =
          action.mode === 'left' || action.mode === 'right' || action.mode === 'centerX' ? 'x' : 'y';
        // Re-review finding 21: exact, no grid snapping of the result
        // (Figma behaviour - shapes can sit off-grid now, e.g. after a 1px
        // nudge, and aligning the rest of a selection to one should not
        // silently un-nudge it by up to 4px).
        let value: number;
        switch (action.mode) {
          case 'left':
            value = box.x;
            break;
          case 'right':
            value = box.x + box.width - n.width;
            break;
          case 'centerX':
            value = box.x + (box.width - n.width) / 2;
            break;
          case 'top':
            value = box.y;
            break;
          case 'bottom':
            value = box.y + box.height - n.height;
            break;
          case 'centerY':
            value = box.y + (box.height - n.height) / 2;
            break;
        }
        if (value === n[axis]) return n;
        changed = true;
        return { ...n, [axis]: value };
      });
      if (!changed) return state;
      return commit(state, { nodes, edges: state.edges });
    }

    // Review finding 9: span was computed from whichever shape sorted last
    // by position, not from the true extents - a wide interior shape can
    // extend further than the "last" (by position) shape, undercounting the
    // span and throwing another shape past the first. Now: span runs from
    // the smallest start to the largest end over every target (not just the
    // sorted endpoints), the shape achieving that largest end stays fixed
    // at its own position (rather than assuming it is always last by sort
    // order), and the gap is clamped to 0 rather than going negative when
    // the shapes do not fit. Finding 8: also tracks `changed`, same as
    // align/reorder above.
    case 'distribute': {
      const targets = action.ids
        .map((id) => state.nodes.find((n) => n.id === id))
        .filter((n): n is DiagramNode => n !== undefined);
      if (targets.length < 3) return state;
      const horizontal = action.axis === 'horizontal';
      const start = (n: DiagramNode) => (horizontal ? n.x : n.y);
      const end = (n: DiagramNode) => (horizontal ? n.x + n.width : n.y + n.height);
      const size = (n: DiagramNode) => (horizontal ? n.width : n.height);

      const minStart = Math.min(...targets.map(start));
      let anchorEnd = targets[0];
      for (const n of targets) {
        if (end(n) > end(anchorEnd)) anchorEnd = n;
      }
      const first = targets.find((n) => start(n) === minStart) ?? targets[0];
      const totalSize = targets.reduce((sum, n) => sum + size(n), 0);
      const span = end(anchorEnd) - minStart;
      const gap = Math.max(0, (span - totalSize) / (targets.length - 1));

      // Every OTHER shape (not the two fixed anchors) fills the middle, in
      // position order - `first`/`anchorEnd` themselves are never in this
      // list, even when one of them does not sort first/last by position.
      const interior = targets.filter((n) => n !== first && n !== anchorEnd).sort((a, b) => start(a) - start(b));
      const ordered = first === anchorEnd ? [first, ...interior] : [first, ...interior, anchorEnd];

      // Re-review finding 21: exact, no grid snapping of the result -
      // same reasoning as align, above.
      const updates = new Map<string, number>();
      let cursor = minStart;
      for (const current of ordered) {
        if (current !== first && current !== anchorEnd) updates.set(current.id, cursor);
        cursor += size(current) + gap;
      }

      let changed = false;
      const nodes = state.nodes.map((n) => {
        const value = updates.get(n.id);
        if (value === undefined) return n;
        if (value === start(n)) return n;
        changed = true;
        return horizontal ? { ...n, x: value } : { ...n, y: value };
      });
      if (!changed) return state;
      return commit(state, { nodes, edges: state.edges });
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

/**
 * Mints a `duplicate` action's `pairs`/`edgePairs` for `ids` (review finding
 * 7: this exact "a connector whose both endpoints are in the duplicated
 * set" computation used to exist three times - here, in diagram-layer.tsx's
 * option-drag, and in workbench.tsx's Cmd+D - one hand-copied filter apiece,
 * exactly the kind of drift the Cmd+D consistency fix was already patching
 * over). Pure: `makeId` is the only source of new ids, same "caller mints
 * every id" rule as the rest of this module - callers pass `nanoid`. An id
 * in `ids` that does not resolve to an existing node is silently skipped,
 * same as `duplicate` itself already does for a `pairs` entry.
 */
export function duplicatePairs(
  state: Pick<DiagramData, 'nodes' | 'edges'>,
  ids: string[],
  makeId: () => string,
): { pairs: { sourceId: string; newId: string }[]; edgePairs: { sourceId: string; newId: string }[] } {
  const idSet = new Set(ids);
  const pairs: { sourceId: string; newId: string }[] = [];
  for (const id of ids) {
    if (!state.nodes.some((n) => n.id === id)) continue;
    pairs.push({ sourceId: id, newId: makeId() });
  }
  const edgePairs = state.edges
    .filter((e) => !!e.source.nodeId && idSet.has(e.source.nodeId) && !!e.target.nodeId && idSet.has(e.target.nodeId))
    .map((e) => ({ sourceId: e.id, newId: makeId() }));
  return { pairs, edgePairs };
}

/**
 * A deep copy of a page's diagram for a duplicated page: every node gets a
 * new id, edges follow their nodes, and edges that point at one of the
 * page's screens are re-pointed through `screenIdMap` (old screen id to the
 * copied screen's id). Edges whose screen is not in the map (a screen that
 * was not copied) are dropped, so the copy never carries a dangling
 * reference.
 */
export function cloneDiagram(
  diagram: DiagramData,
  screenIdMap: Record<string, string>,
  makeId: () => string,
): DiagramData {
  const nodeIdMap: Record<string, string> = {};
  const nodes = diagram.nodes.map((node) => {
    const id = makeId();
    nodeIdMap[node.id] = id;
    return { ...node, id };
  });
  const remap = (endpoint: EdgeEndpoint): EdgeEndpoint | null => {
    if (endpoint.nodeId) {
      const nodeId = nodeIdMap[endpoint.nodeId];
      return nodeId ? { ...endpoint, nodeId } : null;
    }
    if (endpoint.screenId) {
      const screenId = screenIdMap[endpoint.screenId];
      return screenId ? { ...endpoint, screenId } : null;
    }
    return null;
  };
  const edges: DiagramEdge[] = [];
  for (const edge of diagram.edges) {
    const source = remap(edge.source);
    const target = remap(edge.target);
    if (!source || !target) continue;
    edges.push({ ...edge, id: makeId(), source, target });
  }
  return { nodes, edges };
}
