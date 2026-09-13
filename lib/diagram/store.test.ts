import { describe, expect, it } from 'vitest';
import {
  createInitialDiagramState,
  diagramReducer,
  HISTORY_LIMIT,
  MAX_TEXT_LENGTH,
  selectionBounds,
  validateConnection,
  type DiagramEdge,
  type DiagramNode,
  type DiagramState,
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
    expect(state).toEqual({ nodes: [], edges: [], selection: [], history: { past: [], future: [] } });
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

  it('does not duplicate edges', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge()] });
    const next = diagramReducer(state, { type: 'duplicate', pairs: [{ sourceId: 'n1', newId: 'copy1' }] });
    expect(next.edges).toHaveLength(1);
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
