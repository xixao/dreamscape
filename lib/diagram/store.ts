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

import { bezierControlPoints, bounds, getHandlePosition, sideFromPoint, type Box, type Point, type Side } from './geometry';

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

// Connector LINE style (spec section 14, Matt 2026-09-14: "i'd also like a
// connector style - dashed, solid, 90 degree, curved" - the shape half of
// that request, 90 degree/curved, is CONNECTOR_KINDS above; this is the
// new, independent line-style half), optional on DiagramEdge itself so a
// file saved before this feature (every edge absent) round-trips
// unchanged - diagram-layer.tsx/diagram-fields.tsx/lib/diagram/export.ts
// each default an absent value to 'solid' (today's only look) rather than
// this module ever writing that default into stored data, same convention
// as TEXT_SIZES et al above.
export const LINE_STYLES = ['solid', 'dashed'] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

// Shape text styling (spec section 9, Matt 2026-09-13: "give the diagram
// shapes a font selection like small, medium, large. as well as a
// monospaced font, a serif font, and a sans serif font? also let me change
// the color of the fonts independently from the shape's colors") - all
// three optional on DiagramNode itself, so a file saved before this
// feature (every field absent) keeps reading exactly as it always has;
// diagram-layer.tsx/diagram-fields.tsx/lib/diagram/export.ts each default
// an absent value to medium/sans/default (today's only look) rather than
// this module ever writing that default into stored data.
export const TEXT_SIZES = ['small', 'medium', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_FONTS = ['sans', 'serif', 'mono'] as const;
export type TextFont = (typeof TEXT_FONTS)[number];

// 'default' (white) and 'black' bracket the six shape colours, since a
// shape's text often needs to read against its own fill regardless of
// that fill's own hue.
export const TEXT_COLORS = ['default', ...DIAGRAM_COLORS, 'black'] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

export interface DiagramNode {
  id: string;
  kind: DiagramNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: DiagramColor;
  textSize?: TextSize;
  textFont?: TextFont;
  textColor?: TextColor;
  // Marquee selection and groups (spec section 10, Matt 2026-09-13: "for
  // diagram, i need to be able to drag to select multiple items, group
  // them, and also move them around") - optional so a file saved before
  // this feature (every node absent) round-trips unchanged; absent stays
  // absent, never a key set to `undefined`, same convention as
  // textSize/textFont/textColor above. Nested groups are not supported: a
  // node belongs to at most one group at a time, and grouping a selection
  // that already contains grouped members simply overwrites their old
  // groupId with the new one. Review finding B: "a group with a single
  // remaining member is not a group" - a node's own groupId can also be
  // cleared out from under it, defensively, by the `delete`/`group` cases
  // below (dropSingletonGroups) when whatever they do leaves its old
  // group's membership at exactly one.
  groupId?: string;
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
  lineStyle?: LineStyle;
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
  // `ids` (not a single `id`, unlike setKind/setArrow below) - Matt's
  // multi-selection follow-up needs the Design panel to recolour every
  // selected shape in one history step, the same "several shapes, one
  // step" rule setTextStyle below already established; the right-click
  // menu's own single-shape "Color" submenu just passes a one-element
  // array.
  | { type: 'setColor'; ids: string[]; color: DiagramColor }
  | { type: 'setKind'; id: string; kind: DiagramNodeKind | ConnectorKind }
  | { type: 'setArrow'; id: string; arrow: ArrowKind }
  // Spec section 14: the connector's LINE style (solid/dashed), independent
  // of its shape (`setKind`'s straight/step/curve). Mirrors setArrow
  // exactly - one history step, no no-op guard, since this is only ever
  // dispatched from an explicit user choice (the Design panel's Line
  // select or the right-click menu's "Line" submenu).
  | { type: 'setLineStyle'; id: string; lineStyle: LineStyle }
  // Spec section 9: the Design panel's three text-style selects and the
  // right-click menu's "Text" submenu both dispatch this - `ids` rather
  // than a single `id` (unlike setKind/setArrow above) so a
  // multi-shape selection applies in one history step, the same
  // "several shapes, one step" rule align/distribute already established
  // for a diagram multi-selection. Only the keys actually given are
  // applied (an absent key leaves that field alone on every id), and
  // nothing not already a node in `ids` is touched - an edge id is
  // silently ignored, text styling has no meaning for a connector.
  | { type: 'setTextStyle'; ids: string[]; textSize?: TextSize; textFont?: TextFont; textColor?: TextColor }
  | { type: 'connect'; edge: DiagramEdge }
  // Moves ONE end of an existing connector to a different node/frame/side
  // (spec section 12, Matt 2026-09-14: "select a connector line and
  // reconnect either end to a different point on a shape") - dragging a
  // handle on a selected connector (diagram-layer.tsx's endpointDrag
  // gesture). `end` says which end `endpoint` replaces; the other end,
  // the label, the kind and the arrow are all untouched.
  | { type: 'reconnect'; id: string; end: 'source' | 'target'; endpoint: EdgeEndpoint }
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
      // Spec section 10: "duplicate gives copies of a whole group a fresh
      // group id" - old groupId -> freshly-minted groupId, computed by
      // duplicatePairs below (the only place that already knows every
      // node's CURRENT groupId well enough to tell a whole-group copy from
      // a partial one). A copy whose source had a groupId with no entry
      // here (a partial-group duplicate, unreachable through the documented
      // UI - selecting a group member always selects the whole group - but
      // not this reducer's job to assume) gets no groupId at all, same
      // "never a partial/dangling relationship" defense edgePairs already
      // has above.
      groupIdMap?: Record<string, string>;
    }
  // Groups (Cmd+G) two or more existing nodes under a new, caller-minted
  // groupId, overwriting any groupId they already had (spec section 10:
  // "grouping a selection that contains grouped shapes regroups them all
  // into one flat group" - nested groups are not supported). A no-op when
  // fewer than two of `ids` resolve to real nodes. Ungroups (Cmd+Shift+G)
  // by clearing `groupId` from every node that currently carries it - a
  // no-op when nothing does. Both are one history step each, matching every
  // other multi-id action above.
  | { type: 'group'; ids: string[]; groupId: string }
  | { type: 'ungroup'; groupId: string }
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
  // edge or centre, per `mode`), applied exactly (re-review 2 finding 27:
  // a centre value rounds to the nearest integer canvas coordinate, since
  // nothing else does any more). Matt's alignment follow-up.
  | { type: 'align'; ids: string[]; mode: AlignMode }
  // Spreads 3+ nodes in `ids` along `axis` so the gaps between them are
  // equal; the first and last (by position) stay put. Matt's alignment
  // follow-up.
  | { type: 'distribute'; ids: string[]; axis: DistributeAxis }
  | { type: 'select'; selection: DiagramSelection }
  | { type: 'selectAll' }
  | { type: 'clearSelection' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; data: DiagramData };

function endpointKey(endpoint: EdgeEndpoint): string {
  if (endpoint.nodeId) return `node:${endpoint.nodeId}`;
  if (endpoint.screenId) return `screen:${endpoint.screenId}`;
  return '';
}

/**
 * Whether two endpoints name the exact same node/frame AND side - the same
 * node/frame + side identity `validateConnection`'s own duplicate check
 * below already uses, reused here as `reconnect`'s no-op guard (spec
 * section 12: "no-op when nothing changes"). A side that differs (even on
 * the same node/frame) is a real change, not a no-op - the spec's own
 * "releasing over a different side of the same shape moves the end to that
 * side" - so this compares `side` exactly like every other field, never
 * ignoring it.
 */
function sameEndpoint(a: EdgeEndpoint, b: EdgeEndpoint): boolean {
  return endpointKey(a) === endpointKey(b) && (a.side ?? null) === (b.side ?? null);
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

/**
 * Clears `groupId` from any node left as the sole remaining member of its
 * group - review finding B: "a group with a single remaining member is not
 * a group." Applied, in the SAME history step, by every action that can
 * shrink a group's membership below two: `delete` (removes a member
 * outright) and `group` (regrouping a subset of an existing group's
 * members into a new one can strand the rest of the old group at exactly
 * one - the "move away" case). Returns `nodes` itself, unchanged, when
 * nothing needs clearing, so a caller's own `changed`/no-op guard is not
 * defeated by this running unconditionally afterward.
 */
function dropSingletonGroups(nodes: DiagramNode[]): DiagramNode[] {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    if (n.groupId !== undefined) counts.set(n.groupId, (counts.get(n.groupId) ?? 0) + 1);
  }
  const singletons = new Set(Array.from(counts.entries()).filter(([, count]) => count === 1).map(([groupId]) => groupId));
  if (singletons.size === 0) return nodes;
  return nodes.map((n) => {
    if (n.groupId === undefined || !singletons.has(n.groupId)) return n;
    const cleared: DiagramNode = { ...n };
    delete cleared.groupId;
    return cleared;
  });
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

    // Matt's multi-selection follow-up: `ids` rather than a single `id`
    // (see the DiagramAction comment above) - the same "changed" no-op
    // guard as move/reorder/setTextStyle above, so recolouring a selection
    // to the colour it already has does not push a dead history entry.
    case 'setColor': {
      const ids = new Set(action.ids);
      let changed = false;
      const nodes = state.nodes.map((n) => {
        if (!ids.has(n.id) || n.color === action.color) return n;
        changed = true;
        return { ...n, color: action.color };
      });
      if (!changed) return state;
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

    // Spec section 14: mirrors setArrow exactly, immediately above.
    case 'setLineStyle': {
      const index = state.edges.findIndex((e) => e.id === action.id);
      if (index === -1) return state;
      const edges = [...state.edges];
      edges[index] = { ...edges[index], lineStyle: action.lineStyle };
      return commit(state, { nodes: state.nodes, edges });
    }

    // Spec section 9: applies whichever of textSize/textFont/textColor was
    // actually given to every node in `ids`, as one history step - same
    // "no-op, no history" guard shape as move/reorder/align/distribute
    // above, so re-applying a selection's own current values (nothing
    // actually changes) does not push a dead entry onto the undo stack.
    case 'setTextStyle': {
      const ids = new Set(action.ids);
      let changed = false;
      const nodes = state.nodes.map((n) => {
        if (!ids.has(n.id)) return n;
        const next = { ...n };
        if (action.textSize !== undefined && next.textSize !== action.textSize) {
          next.textSize = action.textSize;
          changed = true;
        }
        if (action.textFont !== undefined && next.textFont !== action.textFont) {
          next.textFont = action.textFont;
          changed = true;
        }
        if (action.textColor !== undefined && next.textColor !== action.textColor) {
          next.textColor = action.textColor;
          changed = true;
        }
        return next;
      });
      if (!changed) return state;
      return commit(state, { nodes, edges: state.edges });
    }

    case 'connect': {
      if (!validateConnection(state, action.edge).ok) return state;
      return commit(state, { nodes: state.nodes, edges: [...state.edges, action.edge] });
    }

    // Spec section 12: one history step, refused rather than partially
    // applied - shares `connect`'s own validateConnection rule (self-loop,
    // duplicate) by handing it the hypothetical post-reconnect edge, same
    // as `connect` does for a brand new one. An unknown edge id or an
    // endpoint identical to the one already there (sameEndpoint above) is a
    // no-op, no history entry - the same "changed"/no-op guard shape as
    // move/setColor/setTextStyle above. Label, kind and arrow are carried
    // over untouched since only the one endpoint key on the edge changes.
    case 'reconnect': {
      const index = state.edges.findIndex((e) => e.id === action.id);
      if (index === -1) return state;
      const current = state.edges[index];
      const existing = action.end === 'source' ? current.source : current.target;
      if (sameEndpoint(existing, action.endpoint)) return state;
      const candidate: DiagramEdge =
        action.end === 'source' ? { ...current, source: action.endpoint } : { ...current, target: action.endpoint };
      if (!validateConnection(state, candidate).ok) return state;
      const edges = [...state.edges];
      edges[index] = candidate;
      return commit(state, { nodes: state.nodes, edges });
    }

    case 'disconnect': {
      if (!state.edges.some((e) => e.id === action.id)) return state;
      const edges = state.edges.filter((e) => e.id !== action.id);
      return commit(state, { nodes: state.nodes, edges }, pruneSelection(state.selection, new Set([action.id])));
    }

    case 'delete': {
      const removedIds = new Set(action.ids);
      const survivingNodes = state.nodes.filter((n) => !removedIds.has(n.id));
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
      if (survivingNodes.length === state.nodes.length && edges.length === state.edges.length) return state;
      // Review finding B: a real deletion can strand a group at exactly one
      // remaining member - applied only now that a real change is already
      // confirmed, so a pre-existing (data-anomaly) singleton elsewhere in
      // the diagram is never "cleaned up" by an unrelated delete that would
      // otherwise have been a no-op.
      const nodes = dropSingletonGroups(survivingNodes);
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
        // Spec section 10: a copy of a node that belonged to a group whose
        // ENTIRE membership is being duplicated together gets the one fresh
        // group id duplicatePairs already minted for it; destructured out of
        // the spread below (rather than spread-then-overridden, the way the
        // rest of `source` is copied) so a source with no groupId, or one
        // whose group is only partly represented, produces a copy with the
        // key genuinely absent - never present set to `undefined` - same
        // "absent stays absent" convention as textSize/textFont/textColor.
        const { groupId: sourceGroupId, ...sourceRest } = source;
        const newGroupId = sourceGroupId ? action.groupIdMap?.[sourceGroupId] : undefined;
        // Re-review finding 20: exact offset, no re-snap - the caller (a
        // drag's already-snapped delta, or Cmd+D's plain 16px) already
        // decided the movement; re-snapping the RESULT here disagreed with
        // it the moment the source itself was off-grid.
        copies.push({
          ...sourceRest,
          id: newId,
          x: source.x + offset.x,
          y: source.y + offset.y,
          ...(newGroupId !== undefined ? { groupId: newGroupId } : {}),
        });
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

    // Spec section 10: groups two or more of `ids` under `action.groupId`,
    // overwriting any groupId a node already had (nested groups are not
    // supported - see DiagramNode.groupId's own doc comment for why this
    // reducer never needs to expand a partial selection to a whole group
    // itself). Selection is left exactly as it was: the same shapes stay
    // selected, now as a group.
    case 'group': {
      if (action.ids.length < 2) return state;
      const idSet = new Set(action.ids);
      const targetCount = state.nodes.filter((n) => idSet.has(n.id)).length;
      if (targetCount < 2) return state;
      let changed = false;
      const regrouped = state.nodes.map((n) => {
        if (!idSet.has(n.id) || n.groupId === action.groupId) return n;
        changed = true;
        return { ...n, groupId: action.groupId };
      });
      if (!changed) return state;
      // Review finding B, the "move away" case: regrouping a SUBSET of an
      // existing group's members into this new one can strand the rest of
      // that old group at exactly one - clear that lone survivor's groupId
      // too, in this same history step.
      const nodes = dropSingletonGroups(regrouped);
      return commit(state, { nodes, edges: state.edges });
    }

    // Clears `groupId` from every node that currently carries it - a no-op
    // (no history entry) when nothing does, same guard shape as every other
    // action here.
    case 'ungroup': {
      let changed = false;
      const nodes = state.nodes.map((n) => {
        if (n.groupId !== action.groupId) return n;
        changed = true;
        const cleared: DiagramNode = { ...n };
        delete cleared.groupId;
        return cleared;
      });
      if (!changed) return state;
      return commit(state, { nodes, edges: state.edges });
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
        // Re-review 2 finding 28: applied exactly, no snap - x/y are
        // already integers (the source's own position and size, plus the
        // integer QUICK_ADD_GAP), and snapping them disagreed with this
        // action's own "64px gap, aligned on the other axis" promise the
        // moment the source itself was off-grid (a 1px nudge is now a
        // first-class operation, not an edge case).
        x,
        y,
        width,
        height,
        text: '',
        color: source.color,
        // Spec section 9 (Build step 1: "duplicate/quickAdd/cloneDiagram
        // carry the three fields") - same "same kind, colour" carry-over
        // the spec already names for quickAdd, extended to the shape's
        // own text styling.
        textSize: source.textSize,
        textFont: source.textFont,
        textColor: source.textColor,
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
            // Re-review 2 finding 27: rounded - canvas coordinates are
            // integers (spec section 2), and an odd width/height
            // difference divides by 2 into a fraction with nothing left
            // to round it away now that the result is applied exactly.
            value = Math.round(box.x + (box.width - n.width) / 2);
            break;
          case 'top':
            value = box.y;
            break;
          case 'bottom':
            value = box.y + box.height - n.height;
            break;
          case 'centerY':
            value = Math.round(box.y + (box.height - n.height) / 2);
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

      // Re-review finding 21: exact, no grid snapping of the result - same
      // reasoning as align, above. Re-review 2 finding 27: `gap` is not
      // always an integer, so the WRITTEN position is rounded here; the
      // running `cursor` itself carries the exact fractional total into
      // the next iteration, so gaps stay as even as integer coordinates
      // allow rather than compounding rounding error shape to shape.
      const updates = new Map<string, number>();
      let cursor = minStart;
      for (const current of ordered) {
        if (current !== first && current !== anchorEnd) updates.set(current.id, Math.round(cursor));
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

    case 'selectAll': {
      const selection: DiagramSelection = [
        ...state.nodes.map((n) => ({ type: 'node' as const, id: n.id })),
        ...state.edges.map((e) => ({ type: 'edge' as const, id: e.id })),
      ];
      return state.selection.length === selection.length &&
        state.selection.every((item, i) => selection[i] && item.type === selection[i].type && item.id === selection[i].id)
        ? state
        : { ...state, selection };
    }

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
): {
  pairs: { sourceId: string; newId: string }[];
  edgePairs: { sourceId: string; newId: string }[];
  groupIdMap: Record<string, string>;
} {
  const idSet = new Set(ids);
  const pairs: { sourceId: string; newId: string }[] = [];
  for (const id of ids) {
    if (!state.nodes.some((n) => n.id === id)) continue;
    pairs.push({ sourceId: id, newId: makeId() });
  }
  const edgePairs = state.edges
    .filter((e) => !!e.source.nodeId && idSet.has(e.source.nodeId) && !!e.target.nodeId && idSet.has(e.target.nodeId))
    .map((e) => ({ sourceId: e.id, newId: makeId() }));
  // Spec section 10: "duplicate gives copies of a whole group a fresh group
  // id" - a fresh id per group, but ONLY for a group every one of whose
  // members is present in `ids`; a group only partly represented (not
  // reachable through the documented UI, which always selects a whole
  // group together - see groupSelectionFor/expandToGroups - but not this
  // pure helper's job to assume) gets no entry here at all, so the
  // `duplicate` reducer's own lookup naturally leaves such a copy
  // ungrouped, same "never a partial/dangling relationship" defense
  // edgePairs above already has for a connector.
  const groupIdMap: Record<string, string> = {};
  const groupIds = new Set(state.nodes.map((n) => n.groupId).filter((g): g is string => g !== undefined));
  for (const groupId of groupIds) {
    const members = state.nodes.filter((n) => n.groupId === groupId);
    if (members.every((m) => idSet.has(m.id))) {
      groupIdMap[groupId] = makeId();
    }
  }
  return { pairs, edgePairs, groupIdMap };
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
  // Spec section 10: "cloneDiagram keeps group ids consistent" - every node
  // that shares an old groupId gets the SAME freshly-minted one in the
  // copy (first-seen-wins, same pattern as nodeIdMap itself), not each its
  // own random id, so the copied page's groups still hold together.
  const groupIdMap: Record<string, string> = {};
  const nodes = diagram.nodes.map((node) => {
    const id = makeId();
    nodeIdMap[node.id] = id;
    if (node.groupId === undefined) return { ...node, id };
    if (!groupIdMap[node.groupId]) groupIdMap[node.groupId] = makeId();
    return { ...node, id, groupId: groupIdMap[node.groupId] };
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

/**
 * Expands a set of node ids to the whole group of any grouped node among
 * them, plus every connector fully inside the expanded set - the "clicking
 * or marqueeing any member selects the whole group (all members plus
 * connectors between them)" rule (spec section 10), shared by
 * diagram-layer.tsx's own click handling and canvas.tsx's marquee so the
 * two selection gestures can never disagree about what "the whole group"
 * means. An id with no groupId (or naming no real node) passes through
 * unexpanded and contributes no edges of its own here - a marquee's own
 * general "connector whose path intersects the box" test already covers a
 * connector between ungrouped shapes on its own terms, independent of this
 * function.
 */
export function expandToGroups(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  ids: readonly string[],
): DiagramSelection {
  const groupIds = new Set(
    nodes.filter((n) => ids.includes(n.id) && n.groupId !== undefined).map((n) => n.groupId as string),
  );
  const memberIds = new Set(ids);
  if (groupIds.size > 0) {
    for (const n of nodes) {
      if (n.groupId !== undefined && groupIds.has(n.groupId)) memberIds.add(n.id);
    }
  }
  const nodeItems: DiagramSelection = nodes.filter((n) => memberIds.has(n.id)).map((n) => ({ type: 'node', id: n.id }));
  const edgeItems: DiagramSelection =
    groupIds.size > 0
      ? edges
          .filter((e) => !!e.source.nodeId && memberIds.has(e.source.nodeId) && !!e.target.nodeId && memberIds.has(e.target.nodeId))
          .map((e) => ({ type: 'edge', id: e.id }))
      : [];
  return [...nodeItems, ...edgeItems];
}

/**
 * The group id the current selection exactly represents, or `undefined` -
 * review finding A: "a group is selected" means every member of that group
 * is selected and nothing else, not merely "every selected node happens to
 * agree on one groupId" (which is trivially true for a single selected
 * node too - an array of one element trivially satisfies `.every(...)`).
 * A selected connector between members does not disqualify this - clicking
 * a group already includes its own internal connectors in the selection
 * (see expandToGroups above), so requiring their absence would make this
 * false for the single most ordinary way to select a group at all; it is
 * specifically an extra NODE outside the group, or a selection missing one
 * of the group's own members, that disqualifies it. Shared by
 * diagram-layer.tsx's "Ungroup" menu item and workbench.tsx's
 * Cmd+Shift+G handler so the two can never independently get this wrong.
 */
export function selectedGroupId(nodes: readonly DiagramNode[], selection: DiagramSelection): string | undefined {
  const selectedNodeIds = selection.filter((item) => item.type === 'node').map((item) => item.id);
  if (selectedNodeIds.length === 0) return undefined;
  const groupId = nodes.find((n) => n.id === selectedNodeIds[0])?.groupId;
  if (groupId === undefined) return undefined;
  if (!selectedNodeIds.every((id) => nodes.find((n) => n.id === id)?.groupId === groupId)) return undefined;
  const totalMembers = nodes.filter((n) => n.groupId === groupId).length;
  return totalMembers === selectedNodeIds.length ? groupId : undefined;
}

// A real `Side`, narrowed from whatever an EdgeEndpoint's optional field
// happens to hold - mirrors diagram-layer.tsx's own local `isSide` type
// guard (a plain `readonly string[]`/`includes` check does not by itself
// narrow TypeScript's type for a caller, only a real type guard does).
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];
function isSide(value: string | undefined): value is Side {
  return value !== undefined && (SIDES as readonly string[]).includes(value);
}

/**
 * The bounding box of one connector's rendered path, resolved from its two
 * endpoints' current boxes (a node from `nodes`, or a frame from `frames`) -
 * used by the marquee's own hit test (spec section 10: "every connector
 * whose path bounding box intersects it"). Exact for `straight` and `step`:
 * every point either path can ever visit (the endpoints themselves, and -
 * for `step` - `getStepPoints`'s corners and `buildRoundedPath`'s rounding)
 * is a convex combination of points already inside the two endpoint boxes,
 * so their union always contains the whole rendered path.
 *
 * For `curve`, the plain box union is not a safe bound: geometry.ts's own
 * `bezierControlPoints` offsets each control point outward by
 * `max(distance * BEZIER_CURVATURE, BEZIER_MIN_OFFSET)` - a magnitude that
 * *grows linearly, unboundedly, with the distance between the two handles*
 * (the `BEZIER_MIN_OFFSET` floor only matters when they are close
 * together) - so the bow-out is smallest at short spacing and largest at
 * long spacing, the opposite of "gentle at short spacing." A `curve` whose
 * two sides face the same direction (both `top`, both `left`, ...) can bow
 * arbitrarily far outside the two boxes' union the farther apart they are.
 * This resolves each side the same way diagram-layer.tsx's own
 * `resolveEndpoint` does (a stored side, or the side facing the other
 * endpoint) and returns the bounds of the actual four-point control
 * polygon - both handles plus both bezier control points - which is exact
 * for the same "convex combination of points already in this set" reason
 * `step` is.
 *
 * `null` when either endpoint cannot be resolved (a dangling reference).
 */
export function edgeBounds(
  edge: Pick<DiagramEdge, 'source' | 'target' | 'kind'>,
  nodes: readonly DiagramNode[],
  frames: readonly (Box & { id: string })[],
): Box | null {
  const boxFor = (endpoint: EdgeEndpoint): Box | null => {
    if (endpoint.nodeId) return nodes.find((n) => n.id === endpoint.nodeId) ?? null;
    if (endpoint.screenId) return frames.find((f) => f.id === endpoint.screenId) ?? null;
    return null;
  };
  const sourceBox = boxFor(edge.source);
  const targetBox = boxFor(edge.target);
  if (!sourceBox || !targetBox) return null;
  if (edge.kind !== 'curve') return bounds([sourceBox, targetBox]);

  const centerOf = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const resolveSide = (endpoint: EdgeEndpoint, ownBox: Box, otherBox: Box): Side =>
    isSide(endpoint.side) ? endpoint.side : sideFromPoint(ownBox, centerOf(otherBox));
  const sourceSide = resolveSide(edge.source, sourceBox, targetBox);
  const targetSide = resolveSide(edge.target, targetBox, sourceBox);
  const sourcePoint = getHandlePosition(sourceBox, sourceSide);
  const targetPoint = getHandlePosition(targetBox, targetSide);
  const { c1, c2 } = bezierControlPoints(sourcePoint, sourceSide, targetPoint, targetSide);
  const pointBox = (p: Point): Box => ({ x: p.x, y: p.y, width: 0, height: 0 });
  return bounds([pointBox(sourcePoint), pointBox(c1), pointBox(c2), pointBox(targetPoint)]);
}
