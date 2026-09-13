import { describe, expect, it } from 'vitest';
import {
  createInitialDiagramState,
  diagramReducer,
  HISTORY_LIMIT,
  MAX_TEXT_LENGTH,
  pruneEdgesForScreen,
  selectionBounds,
  validateConnection,
  type DiagramData,
  type DiagramEdge,
  type DiagramNode,
  type DiagramState,
  cloneDiagram,
} from './store';

function node(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: 'n1',
    kind: 'rect',
    x: 0,
    y: 0,
    width: 120,
    height: 60,
    text: '',
    color: 'neutral',
    ...overrides,
  };
}

function edge(overrides: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    id: 'e1',
    source: { nodeId: 'n1', side: 'right' },
    target: { nodeId: 'n2', side: 'left' },
    kind: 'step',
    arrow: 'end',
    ...overrides,
  };
}

function stateWith(overrides: Partial<Pick<DiagramState, 'nodes' | 'edges' | 'selection'>> = {}): DiagramState {
  return { ...createInitialDiagramState(), ...overrides };
}

describe('createInitialDiagramState', () => {
  it('defaults to an empty diagram with no selection and no history', () => {
    const state = createInitialDiagramState();
    expect(state).toEqual({
      nodes: [],
      edges: [],
      selection: [],
      history: { past: [], future: [] },
      lastCreatedIds: [],
    });
  });

  it('hydrates from given nodes/edges', () => {
    const state = createInitialDiagramState({ nodes: [node()], edges: [] });
    expect(state.nodes).toHaveLength(1);
    expect(state.history).toEqual({ past: [], future: [] });
  });
});

describe('diagramReducer: add', () => {
  it('appends the node and selects it', () => {
    const state = createInitialDiagramState();
    const next = diagramReducer(state, { type: 'add', node: node() });
    expect(next.nodes).toEqual([node()]);
    expect(next.selection).toEqual([{ type: 'node', id: 'n1' }]);
  });

  it('is undoable', () => {
    const state = createInitialDiagramState();
    const added = diagramReducer(state, { type: 'add', node: node() });
    const undone = diagramReducer(added, { type: 'undo' });
    expect(undone.nodes).toEqual([]);
  });

  it('records the new node id as lastCreatedIds', () => {
    const next = diagramReducer(createInitialDiagramState(), { type: 'add', node: node() });
    expect(next.lastCreatedIds).toEqual(['n1']);
  });
});

describe('diagramReducer: lastCreatedIds', () => {
  it('is carried forward, unchanged, by an action that creates nothing new', () => {
    const added = diagramReducer(createInitialDiagramState(), { type: 'add', node: node() });
    const moved = diagramReducer(added, { type: 'move', ids: ['n1'], dx: 8, dy: 0 });
    expect(moved.lastCreatedIds).toEqual(['n1']);
  });

  it('is reset to empty by undo and redo', () => {
    const added = diagramReducer(createInitialDiagramState(), { type: 'add', node: node() });
    const undone = diagramReducer(added, { type: 'undo' });
    expect(undone.lastCreatedIds).toEqual([]);
    const readded = diagramReducer(undone, { type: 'add', node: node() });
    const redone = diagramReducer(diagramReducer(readded, { type: 'undo' }), { type: 'redo' });
    expect(redone.lastCreatedIds).toEqual([]);
  });
});

describe('diagramReducer: move', () => {
  it('moves and snaps every given id to the 8px grid', () => {
    const state = stateWith({ nodes: [node({ id: 'a', x: 10, y: 10 }), node({ id: 'b', x: 100, y: 100 })] });
    const next = diagramReducer(state, { type: 'move', ids: ['a'], dx: 3, dy: 5 });
    // (10+3, 10+5) = (13, 15) snapped to the nearest 8 -> (16, 16).
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 16, y: 16 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 100, y: 100 });
  });

  it('ignores unknown ids without touching history', () => {
    const state = stateWith({ nodes: [node()] });
    const next = diagramReducer(state, { type: 'move', ids: ['missing'], dx: 8, dy: 8 });
    expect(next).toBe(state);
  });
});

describe('diagramReducer: resize', () => {
  it('snaps width/height to the grid', () => {
    const state = stateWith({ nodes: [node({ width: 120, height: 60 })] });
    const next = diagramReducer(state, { type: 'resize', id: 'n1', width: 101, height: 59 });
    expect(next.nodes[0]).toMatchObject({ width: 104, height: 56 });
  });

  it('never lets a shape collapse to zero or negative size', () => {
    const state = stateWith({ nodes: [node()] });
    const next = diagramReducer(state, { type: 'resize', id: 'n1', width: -20, height: 2 });
    expect(next.nodes[0].width).toBeGreaterThan(0);
    expect(next.nodes[0].height).toBeGreaterThan(0);
  });

  it('also repositions the node, snapped to the grid, when x/y are given (a corner resize)', () => {
    const state = stateWith({ nodes: [node({ x: 100, y: 100, width: 100, height: 50 })] });
    const next = diagramReducer(state, { type: 'resize', id: 'n1', width: 120, height: 64, x: 80, y: 90 });
    // y:90 is not a multiple of 8 - snapped the same way move() snaps x/y.
    expect(next.nodes[0]).toMatchObject({ x: 80, y: 88, width: 120, height: 64 });
  });

  it('leaves x/y untouched when they are not given (bottom-right corner, or a plain width/height resize)', () => {
    const state = stateWith({ nodes: [node({ x: 100, y: 100, width: 100, height: 50 })] });
    const next = diagramReducer(state, { type: 'resize', id: 'n1', width: 140, height: 90 });
    expect(next.nodes[0]).toMatchObject({ x: 100, y: 100 });
  });

  it('undoes a corner resize (size and position together) in a single step', () => {
    const state = stateWith({ nodes: [node({ id: 'n1', x: 100, y: 100, width: 100, height: 50 })] });
    const resized = diagramReducer(state, { type: 'resize', id: 'n1', width: 120, height: 60, x: 80, y: 90 });
    const undone = diagramReducer(resized, { type: 'undo' });
    expect(undone.nodes[0]).toMatchObject({ x: 100, y: 100, width: 100, height: 50 });
  });
});

describe('diagramReducer: setText', () => {
  it('sets a node\'s text', () => {
    const state = stateWith({ nodes: [node()] });
    const next = diagramReducer(state, { type: 'setText', id: 'n1', text: 'Login' });
    expect(next.nodes[0].text).toBe('Login');
  });

  it('sets an edge\'s label', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge()] });
    const next = diagramReducer(state, { type: 'setText', id: 'e1', text: 'yes' });
    expect(next.edges[0].label).toBe('yes');
  });

  it('clamps to 500 characters', () => {
    const state = stateWith({ nodes: [node()] });
    const next = diagramReducer(state, { type: 'setText', id: 'n1', text: 'x'.repeat(600) });
    expect(next.nodes[0].text).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('is a no-op for an unknown id', () => {
    const state = stateWith({ nodes: [node()] });
    const next = diagramReducer(state, { type: 'setText', id: 'missing', text: 'x' });
    expect(next).toBe(state);
  });
});

describe('diagramReducer: setColor / setKind / setArrow', () => {
  it('sets a node color', () => {
    const state = stateWith({ nodes: [node()] });
    const next = diagramReducer(state, { type: 'setColor', id: 'n1', color: 'blue' });
    expect(next.nodes[0].color).toBe('blue');
  });

  it('sets a node shape kind', () => {
    const state = stateWith({ nodes: [node()] });
    const next = diagramReducer(state, { type: 'setKind', id: 'n1', kind: 'decision' });
    expect(next.nodes[0].kind).toBe('decision');
  });

  it('sets a connector kind', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge()] });
    const next = diagramReducer(state, { type: 'setKind', id: 'e1', kind: 'curve' });
    expect(next.edges[0].kind).toBe('curve');
  });

  it('sets a connector arrow', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge()] });
    const next = diagramReducer(state, { type: 'setArrow', id: 'e1', arrow: 'both' });
    expect(next.edges[0].arrow).toBe('both');
  });
});

describe('diagramReducer: connect', () => {
  const base = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })] });

  it('adds a validated edge', () => {
    const next = diagramReducer(base, { type: 'connect', edge: edge() });
    expect(next.edges).toEqual([edge()]);
  });

  it('refuses a self-connection', () => {
    const selfEdge = edge({ source: { nodeId: 'n1', side: 'right' }, target: { nodeId: 'n1', side: 'left' } });
    const next = diagramReducer(base, { type: 'connect', edge: selfEdge });
    expect(next).toBe(base);
  });

  it('refuses a duplicate edge between the same endpoints and sides', () => {
    const withEdge = diagramReducer(base, { type: 'connect', edge: edge() });
    const next = diagramReducer(withEdge, { type: 'connect', edge: edge({ id: 'e2' }) });
    expect(next.edges).toHaveLength(1);
  });

  it('allows a second edge between the same nodes on different sides', () => {
    const withEdge = diagramReducer(base, { type: 'connect', edge: edge() });
    const second = edge({ id: 'e2', source: { nodeId: 'n1', side: 'bottom' }, target: { nodeId: 'n2', side: 'top' } });
    const next = diagramReducer(withEdge, { type: 'connect', edge: second });
    expect(next.edges).toHaveLength(2);
  });

  it('connects a shape to a frame (screenId endpoint)', () => {
    const toFrame = edge({ id: 'e2', target: { screenId: 'screen1', side: 'left' } });
    const next = diagramReducer(base, { type: 'connect', edge: toFrame });
    expect(next.edges).toHaveLength(1);
  });
});

describe('validateConnection', () => {
  it('rejects an edge missing an endpoint', () => {
    const result = validateConnection({ edges: [] }, edge({ source: {}, target: { nodeId: 'n2' } }));
    expect(result.ok).toBe(false);
  });

  it('accepts a normal connection', () => {
    expect(validateConnection({ edges: [] }, edge()).ok).toBe(true);
  });
});

describe('diagramReducer: disconnect', () => {
  it('removes the edge by id', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge()] });
    const next = diagramReducer(state, { type: 'disconnect', id: 'e1' });
    expect(next.edges).toEqual([]);
  });
});

describe('diagramReducer: delete', () => {
  it('removes the given nodes and edges', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge()] });
    const next = diagramReducer(state, { type: 'delete', ids: ['n2'] });
    expect(next.nodes.map((n) => n.id)).toEqual(['n1']);
    // The edge referenced the deleted node, so it is removed too even
    // though only the node's id was passed in.
    expect(next.edges).toEqual([]);
  });

  it('prunes the selection of anything deleted', () => {
    const state = stateWith({
      nodes: [node({ id: 'n1' })],
      selection: [{ type: 'node', id: 'n1' }],
    });
    const next = diagramReducer(state, { type: 'delete', ids: ['n1'] });
    expect(next.selection).toEqual([]);
  });
});

describe('diagramReducer: duplicate', () => {
  it('copies the given nodes with a 16px offset and the supplied new ids', () => {
    const state = stateWith({ nodes: [node({ id: 'n1', x: 40, y: 40 })] });
    const next = diagramReducer(state, { type: 'duplicate', pairs: [{ sourceId: 'n1', newId: 'copy1' }] });
    expect(next.nodes).toHaveLength(2);
    const copy = next.nodes.find((n) => n.id === 'copy1');
    expect(copy).toMatchObject({ x: 56, y: 56 });
    expect(next.selection).toEqual([{ type: 'node', id: 'copy1' }]);
  });

  it('does not duplicate edges when no edgePairs are given', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge()] });
    const next = diagramReducer(state, { type: 'duplicate', pairs: [{ sourceId: 'n1', newId: 'copy1' }] });
    expect(next.edges).toHaveLength(1);
  });

  it('records the newly-created ids as lastCreatedIds', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' })] });
    const next = diagramReducer(state, { type: 'duplicate', pairs: [{ sourceId: 'n1', newId: 'copy1' }] });
    expect(next.lastCreatedIds).toEqual(['copy1']);
  });

  it('accepts an explicit offset (e.g. zero, for an option-drag duplicate), snapped to the grid', () => {
    const state = stateWith({ nodes: [node({ id: 'n1', x: 40, y: 40 })] });
    const next = diagramReducer(state, {
      type: 'duplicate',
      pairs: [{ sourceId: 'n1', newId: 'copy1' }],
      offset: { x: 0, y: 0 },
    });
    expect(next.nodes.find((n) => n.id === 'copy1')).toMatchObject({ x: 40, y: 40 });
  });

  it('duplicates a connector whose both endpoints are being duplicated', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge({ id: 'e1' })] });
    const next = diagramReducer(state, {
      type: 'duplicate',
      pairs: [
        { sourceId: 'n1', newId: 'copy1' },
        { sourceId: 'n2', newId: 'copy2' },
      ],
      edgePairs: [{ sourceId: 'e1', newId: 'edgeCopy1' }],
    });
    expect(next.edges).toHaveLength(2);
    const copiedEdge = next.edges.find((e) => e.id === 'edgeCopy1');
    expect(copiedEdge).toMatchObject({
      source: { nodeId: 'copy1', side: 'right' },
      target: { nodeId: 'copy2', side: 'left' },
      kind: 'step',
    });
  });

  it('does not duplicate a connector whose other endpoint is not also being duplicated', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge({ id: 'e1' })] });
    const next = diagramReducer(state, {
      type: 'duplicate',
      pairs: [{ sourceId: 'n1', newId: 'copy1' }],
      edgePairs: [{ sourceId: 'e1', newId: 'edgeCopy1' }],
    });
    expect(next.edges).toHaveLength(1);
  });
});

describe('diagramReducer: reorder', () => {
  it('brings the given node to the front (end of the array)', () => {
    const state = stateWith({ nodes: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })] });
    const next = diagramReducer(state, { type: 'reorder', ids: ['a'], to: 'front' });
    expect(next.nodes.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('sends the given node to the back (start of the array)', () => {
    const state = stateWith({ nodes: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })] });
    const next = diagramReducer(state, { type: 'reorder', ids: ['c'], to: 'back' });
    expect(next.nodes.map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });

  it('preserves the relative order of multiple reordered nodes', () => {
    const state = stateWith({ nodes: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' }), node({ id: 'd' })] });
    const next = diagramReducer(state, { type: 'reorder', ids: ['c', 'a'], to: 'front' });
    expect(next.nodes.map((n) => n.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('is a no-op for unknown ids, without touching history', () => {
    const state = stateWith({ nodes: [node({ id: 'a' })] });
    const next = diagramReducer(state, { type: 'reorder', ids: ['missing'], to: 'front' });
    expect(next).toBe(state);
  });

  it('is undoable', () => {
    const state = stateWith({ nodes: [node({ id: 'a' }), node({ id: 'b' })] });
    const next = diagramReducer(state, { type: 'reorder', ids: ['a'], to: 'front' });
    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('diagramReducer: quickAdd', () => {
  // x/y/width/height all chosen as clean multiples of 8 so every derived
  // position below is unambiguous (no snapToGrid rounding to reason about).
  const source = node({ id: 'src', x: 96, y: 96, width: 128, height: 64, kind: 'decision', color: 'blue' });

  it('adds a same kind/colour/size shape 64px to the right, aligned on y, with a step edge right-to-left', () => {
    const state = stateWith({ nodes: [source] });
    const next = diagramReducer(state, {
      type: 'quickAdd',
      sourceId: 'src',
      side: 'right',
      newNodeId: 'new1',
      newEdgeId: 'edge1',
    });
    // 96 (source x) + 128 (source width) + 64 (gap) = 288.
    const created = next.nodes.find((n) => n.id === 'new1');
    expect(created).toMatchObject({ kind: 'decision', color: 'blue', width: 128, height: 64, text: '', x: 288, y: 96 });
    expect(next.edges.find((e) => e.id === 'edge1')).toMatchObject({
      source: { nodeId: 'src', side: 'right' },
      target: { nodeId: 'new1', side: 'left' },
      kind: 'step',
      arrow: 'end',
    });
    expect(next.selection).toEqual([{ type: 'node', id: 'new1' }]);
    expect(next.lastCreatedIds).toEqual(['new1']);
  });

  it('adds to the left, aligned on y, with a step edge left-to-right', () => {
    const state = stateWith({ nodes: [source] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'src', side: 'left', newNodeId: 'new1', newEdgeId: 'edge1' });
    // 96 (source x) - 64 (gap) - 128 (new width) = -96.
    expect(next.nodes.find((n) => n.id === 'new1')).toMatchObject({ x: -96, y: 96 });
    expect(next.edges[0]).toMatchObject({ source: { nodeId: 'src', side: 'left' }, target: { nodeId: 'new1', side: 'right' } });
  });

  it('adds below, aligned on x, with a step edge bottom-to-top', () => {
    const state = stateWith({ nodes: [source] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'src', side: 'bottom', newNodeId: 'new1', newEdgeId: 'edge1' });
    // 96 (source y) + 64 (source height) + 64 (gap) = 224.
    expect(next.nodes.find((n) => n.id === 'new1')).toMatchObject({ x: 96, y: 224 });
    expect(next.edges[0]).toMatchObject({ source: { nodeId: 'src', side: 'bottom' }, target: { nodeId: 'new1', side: 'top' } });
  });

  it('adds above, aligned on x, with a step edge top-to-bottom', () => {
    const state = stateWith({ nodes: [source] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'src', side: 'top', newNodeId: 'new1', newEdgeId: 'edge1' });
    // 96 (source y) - 64 (gap) - 64 (new height) = -32.
    expect(next.nodes.find((n) => n.id === 'new1')).toMatchObject({ x: 96, y: -32 });
    expect(next.edges[0]).toMatchObject({ source: { nodeId: 'src', side: 'top' }, target: { nodeId: 'new1', side: 'bottom' } });
  });

  it('is a no-op for an unknown source', () => {
    const state = stateWith({ nodes: [] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'missing', side: 'right', newNodeId: 'new1', newEdgeId: 'edge1' });
    expect(next).toBe(state);
  });

  it('is a single undo step for both the new node and its edge', () => {
    const state = stateWith({ nodes: [source] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'src', side: 'right', newNodeId: 'new1', newEdgeId: 'edge1' });
    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.nodes).toEqual([source]);
    expect(undone.edges).toEqual([]);
  });
});

describe('diagramReducer: align', () => {
  // Chosen so every mode below (left/right/centerX/top/bottom/centerY) lands
  // exactly on an 8px multiple with no rounding ambiguity: bounding box of
  // a+b is x:0..96 (width 96), y:0..128 (height 128).
  const a = node({ id: 'a', x: 0, y: 0, width: 48, height: 32 });
  const b = node({ id: 'b', x: 80, y: 32, width: 16, height: 96 });

  it('aligns left edges to the selection bounding box', () => {
    const state = stateWith({ nodes: [a, b] });
    const next = diagramReducer(state, { type: 'align', ids: ['a', 'b'], mode: 'left' });
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 0 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 0 });
  });

  it('aligns right edges to the selection bounding box', () => {
    const state = stateWith({ nodes: [a, b] });
    const next = diagramReducer(state, { type: 'align', ids: ['a', 'b'], mode: 'right' });
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 48 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 80 });
  });

  it('centers horizontally on the selection bounding box, snapped to 8px', () => {
    const state = stateWith({ nodes: [a, b] });
    const next = diagramReducer(state, { type: 'align', ids: ['a', 'b'], mode: 'centerX' });
    // box center x = 48. a (width 48): 48-24=24. b (width 16): 48-8=40.
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 24 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 40 });
  });

  it('aligns to the top edge of the selection bounding box', () => {
    const state = stateWith({ nodes: [a, b] });
    const next = diagramReducer(state, { type: 'align', ids: ['a', 'b'], mode: 'top' });
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ y: 0 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ y: 0 });
  });

  it('aligns to the bottom edge of the selection bounding box', () => {
    const state = stateWith({ nodes: [a, b] });
    const next = diagramReducer(state, { type: 'align', ids: ['a', 'b'], mode: 'bottom' });
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ y: 96 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ y: 32 });
  });

  it('centers vertically on the selection bounding box', () => {
    const state = stateWith({ nodes: [a, b] });
    const next = diagramReducer(state, { type: 'align', ids: ['a', 'b'], mode: 'centerY' });
    // box center y = 64. a (height 32): 64-16=48. b (height 96): 64-48=16.
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ y: 48 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ y: 16 });
  });

  it('is a no-op with fewer than two valid nodes', () => {
    const state = stateWith({ nodes: [a] });
    const next = diagramReducer(state, { type: 'align', ids: ['a', 'missing'], mode: 'left' });
    expect(next).toBe(state);
  });

  it('is one undo step', () => {
    const state = stateWith({ nodes: [a, b] });
    const next = diagramReducer(state, { type: 'align', ids: ['a', 'b'], mode: 'left' });
    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.nodes).toEqual([a, b]);
  });
});

describe('diagramReducer: distribute', () => {
  // c.x=208 (not 200) deliberately: it keeps every gap/cursor computation
  // below off the exact midpoint between two 8px multiples, where
  // `snapToGrid`'s round-half-up (Math.round(12.5) === 13, not 12, per plain
  // JS semantics - not something this action should paper over) would
  // otherwise make the "clean" arithmetic in the comments below misleading.
  const a = node({ id: 'a', x: 0, y: 0, width: 40, height: 20 });
  const b = node({ id: 'b', x: 60, y: 0, width: 40, height: 20 });
  const c = node({ id: 'c', x: 208, y: 0, width: 40, height: 20 });

  it('distributes three shapes horizontally with equal gaps, first and last unchanged', () => {
    const state = stateWith({ nodes: [a, b, c] });
    const next = diagramReducer(state, { type: 'distribute', ids: ['a', 'b', 'c'], axis: 'horizontal' });
    // Span from a.x=0 to c.x+width=248, minus the 3 widths (120) leaves 128
    // of gap over 2 gaps = 64 each: b sits at a's right edge (40) + 64 = 104.
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 0 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 104 });
    expect(next.nodes.find((n) => n.id === 'c')).toMatchObject({ x: 208 });
  });

  it('distributes vertically', () => {
    const av = node({ id: 'a', x: 0, y: 0, width: 20, height: 40 });
    const bv = node({ id: 'b', x: 0, y: 60, width: 20, height: 40 });
    const cv = node({ id: 'c', x: 0, y: 208, width: 20, height: 40 });
    const state = stateWith({ nodes: [av, bv, cv] });
    const next = diagramReducer(state, { type: 'distribute', ids: ['a', 'b', 'c'], axis: 'vertical' });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ y: 104 });
  });

  it('sorts by position first, so ids need not be given in left-to-right order', () => {
    const state = stateWith({ nodes: [a, b, c] });
    const next = diagramReducer(state, { type: 'distribute', ids: ['c', 'a', 'b'], axis: 'horizontal' });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 104 });
  });

  it('is a no-op with fewer than three valid nodes', () => {
    const state = stateWith({ nodes: [a, b] });
    const next = diagramReducer(state, { type: 'distribute', ids: ['a', 'b'], axis: 'horizontal' });
    expect(next).toBe(state);
  });

  it('is one undo step', () => {
    const state = stateWith({ nodes: [a, b, c] });
    const next = diagramReducer(state, { type: 'distribute', ids: ['a', 'b', 'c'], axis: 'horizontal' });
    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.nodes).toEqual([a, b, c]);
  });
});

describe('diagramReducer: selection', () => {
  it('select replaces the selection with no history entry', () => {
    const state = stateWith({ nodes: [node()] });
    const selected = diagramReducer(state, { type: 'select', selection: [{ type: 'node', id: 'n1' }] });
    expect(selected.selection).toEqual([{ type: 'node', id: 'n1' }]);
    // Nothing to undo: selecting is not an edit.
    expect(diagramReducer(selected, { type: 'undo' })).toBe(selected);
  });

  it('clearSelection empties it', () => {
    const state = { ...stateWith({ nodes: [node()] }), selection: [{ type: 'node' as const, id: 'n1' }] };
    const next = diagramReducer(state, { type: 'clearSelection' });
    expect(next.selection).toEqual([]);
  });
});

describe('diagramReducer: undo/redo', () => {
  it('round-trips an edit', () => {
    const state = createInitialDiagramState();
    const added = diagramReducer(state, { type: 'add', node: node() });
    const moved = diagramReducer(added, { type: 'move', ids: ['n1'], dx: 8, dy: 0 });
    const undone = diagramReducer(moved, { type: 'undo' });
    expect(undone.nodes[0].x).toBe(0);
    const redone = diagramReducer(undone, { type: 'redo' });
    expect(redone.nodes[0].x).toBe(8);
  });

  it('undo is a no-op with nothing to undo, redo is a no-op with nothing to redo', () => {
    const state = createInitialDiagramState();
    expect(diagramReducer(state, { type: 'undo' })).toBe(state);
    expect(diagramReducer(state, { type: 'redo' })).toBe(state);
  });

  it('caps the undo stack at 100 steps', () => {
    let state = createInitialDiagramState();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      state = diagramReducer(state, { type: 'add', node: node({ id: `n${i}` }) });
    }
    expect(state.history.past.length).toBe(HISTORY_LIMIT);
    // Undoing HISTORY_LIMIT times empties the stack but the 10 oldest
    // additions can never be undone away - 10 nodes remain.
    for (let i = 0; i < HISTORY_LIMIT; i++) {
      state = diagramReducer(state, { type: 'undo' });
    }
    expect(state.nodes).toHaveLength(10);
    expect(state.history.past).toHaveLength(0);
  });

  it('a fresh edit after undo clears the redo stack', () => {
    const added = diagramReducer(createInitialDiagramState(), { type: 'add', node: node() });
    const undone = diagramReducer(added, { type: 'undo' });
    const addedAgain = diagramReducer(undone, { type: 'add', node: node({ id: 'n2' }) });
    expect(addedAgain.history.future).toEqual([]);
    expect(diagramReducer(addedAgain, { type: 'redo' })).toBe(addedAgain);
  });
});

describe('diagramReducer: load', () => {
  it('replaces nodes/edges and resets selection and history', () => {
    const state = { ...stateWith({ nodes: [node()] }), selection: [{ type: 'node' as const, id: 'n1' }] };
    const next = diagramReducer(state, { type: 'load', data: { nodes: [], edges: [] } });
    expect(next).toEqual(createInitialDiagramState());
  });
});

describe('pruneEdgesForScreen', () => {
  it('removes an edge whose source references the given screenId', () => {
    const diagram: DiagramData = {
      nodes: [node()],
      edges: [edge({ source: { screenId: 'screen1' }, target: { nodeId: 'n1' } })],
    };
    expect(pruneEdgesForScreen(diagram, 'screen1')).toEqual({ nodes: diagram.nodes, edges: [] });
  });

  it('removes an edge whose target references the given screenId', () => {
    const diagram: DiagramData = {
      nodes: [node()],
      edges: [edge({ source: { nodeId: 'n1' }, target: { screenId: 'screen1' } })],
    };
    expect(pruneEdgesForScreen(diagram, 'screen1')).toEqual({ nodes: diagram.nodes, edges: [] });
  });

  it('leaves an edge referencing a different screenId untouched', () => {
    const diagram: DiagramData = {
      nodes: [],
      edges: [edge({ source: { screenId: 'screen1' }, target: { screenId: 'screen2' } })],
    };
    expect(pruneEdgesForScreen(diagram, 'screen9')).toEqual(diagram);
  });

  it('leaves node-to-node edges (no screenId at all) untouched', () => {
    const diagram: DiagramData = { nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge()] };
    expect(pruneEdgesForScreen(diagram, 'screen1')).toEqual(diagram);
  });

  it('returns the exact same diagram reference when nothing needed pruning', () => {
    const diagram: DiagramData = { nodes: [node()], edges: [edge()] };
    expect(pruneEdgesForScreen(diagram, 'screen1')).toBe(diagram);
  });

  it('prunes only the edges that reference the given screenId, keeping the rest', () => {
    const kept = edge({ id: 'e-kept', source: { nodeId: 'n1' }, target: { screenId: 'screen2' } });
    const removed = edge({ id: 'e-removed', source: { nodeId: 'n1' }, target: { screenId: 'screen1' } });
    const diagram: DiagramData = { nodes: [node()], edges: [kept, removed] };
    expect(pruneEdgesForScreen(diagram, 'screen1')).toEqual({ nodes: diagram.nodes, edges: [kept] });
  });
});

describe('selectionBounds', () => {
  it('is null when nothing is selected', () => {
    const state = stateWith({ nodes: [node()] });
    expect(selectionBounds(state)).toBeNull();
  });

  it('is the bounding box of the selected nodes', () => {
    const state = {
      ...stateWith({ nodes: [node({ id: 'a', x: 0, y: 0, width: 40, height: 40 }), node({ id: 'b', x: 100, y: 100, width: 20, height: 20 })] }),
      selection: [
        { type: 'node' as const, id: 'a' },
        { type: 'node' as const, id: 'b' },
      ],
    };
    expect(selectionBounds(state)).toEqual({ x: 0, y: 0, width: 120, height: 120 });
  });

  it('ignores edges in the selection (no box of their own)', () => {
    const state = {
      ...stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge()] }),
      selection: [{ type: 'edge' as const, id: 'e1' }],
    };
    expect(selectionBounds(state)).toBeNull();
  });
});

describe('cloneDiagram', () => {
  it('copies nodes with new ids, follows edges to the copies and re-points screen endpoints through the map', () => {
    let n = 0;
    const makeId = () => `new${++n}`;
    const diagram = {
      nodes: [
        { id: 'a', kind: 'rect' as const, x: 0, y: 0, width: 160, height: 80, text: 'A', color: 'neutral' as const },
        { id: 'b', kind: 'decision' as const, x: 300, y: 0, width: 160, height: 100, text: 'B', color: 'blue' as const },
      ],
      edges: [
        { id: 'e1', kind: 'step' as const, arrow: 'end' as const, source: { nodeId: 'a', side: 'right' as const }, target: { nodeId: 'b', side: 'left' as const } },
        { id: 'e2', kind: 'step' as const, arrow: 'end' as const, source: { nodeId: 'b', side: 'top' as const }, target: { screenId: 's1', side: 'bottom' as const } },
        { id: 'e3', kind: 'straight' as const, arrow: 'none' as const, source: { nodeId: 'a', side: 'top' as const }, target: { screenId: 'gone', side: 'bottom' as const } },
      ],
    };

    const copy = cloneDiagram(diagram, { s1: 's1copy' }, makeId);

    expect(copy.nodes.map((node) => node.id)).toEqual(['new1', 'new2']);
    expect(copy.nodes[0]).toMatchObject({ text: 'A', kind: 'rect' });
    expect(copy.edges).toHaveLength(2);
    expect(copy.edges[0]).toMatchObject({ source: { nodeId: 'new1' }, target: { nodeId: 'new2' } });
    expect(copy.edges[1]).toMatchObject({ source: { nodeId: 'new2' }, target: { screenId: 's1copy' } });
    expect(copy.edges.every((edge) => edge.id.startsWith('new'))).toBe(true);
    // The original is untouched.
    expect(diagram.nodes[0].id).toBe('a');
    expect(diagram.edges).toHaveLength(3);
  });
});
