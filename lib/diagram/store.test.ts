import { describe, expect, it } from 'vitest';
import {
  createInitialDiagramState,
  diagramReducer,
  duplicatePairs,
  edgeBounds,
  expandToGroups,
  HISTORY_LIMIT,
  MAX_TEXT_LENGTH,
  pruneEdgesForScreen,
  selectedGroupId,
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
});

describe('diagramReducer: move', () => {
  // Review finding 10 (Matt's nudge rule): move adds the delta exactly, with
  // no snapping of its own - a plain arrow-key nudge must land 1px away, not
  // jump to the nearest 8px multiple. Snapping to the grid is now the
  // CALLER's job: the diagram layer snaps a drag's pointer delta before
  // dispatching (so drags still land on the grid, tested in
  // diagram-layer.test.tsx), while a nudge dispatches its 1 or 8 px amount
  // unsnapped, on purpose.
  it('adds the delta exactly, with no snapping of its own', () => {
    const state = stateWith({ nodes: [node({ id: 'a', x: 10, y: 10 }), node({ id: 'b', x: 100, y: 100 })] });
    const next = diagramReducer(state, { type: 'move', ids: ['a'], dx: 3, dy: 5 });
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 13, y: 15 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 100, y: 100 });
  });

  it('moves a selection by exactly 1px, off the 8px grid, for a plain nudge', () => {
    const state = stateWith({ nodes: [node({ id: 'a', x: 100, y: 100 })] });
    const next = diagramReducer(state, { type: 'move', ids: ['a'], dx: 1, dy: 0 });
    expect(next.nodes[0]).toMatchObject({ x: 101, y: 100 });
  });

  it('ignores unknown ids without touching history', () => {
    const state = stateWith({ nodes: [node()] });
    const next = diagramReducer(state, { type: 'move', ids: ['missing'], dx: 8, dy: 8 });
    expect(next).toBe(state);
  });
});

describe('diagramReducer: resize', () => {
  // Re-review finding 21: one rule across move/resize/duplicate - the
  // LAYER snaps a gesture's delta to the grid before it ever dispatches
  // (so the live preview and the landing box always agree), and the
  // reducer stores exactly what it is given, same as move already does.
  // Re-snapping the result HERE, on top of an already-snapped dispatch,
  // is what let a shape's preview and its landing box disagree the moment
  // the shape itself started off-grid.
  it('applies width/height exactly, with no re-snap of its own - grid alignment is the caller\'s job', () => {
    const state = stateWith({ nodes: [node({ width: 120, height: 60 })] });
    const next = diagramReducer(state, { type: 'resize', id: 'n1', width: 101, height: 59 });
    expect(next.nodes[0]).toMatchObject({ width: 101, height: 59 });
  });

  it('never lets a shape collapse to zero or negative size (a floor, not a grid snap)', () => {
    const state = stateWith({ nodes: [node()] });
    const next = diagramReducer(state, { type: 'resize', id: 'n1', width: -20, height: 2 });
    expect(next.nodes[0].width).toBeGreaterThan(0);
    expect(next.nodes[0].height).toBeGreaterThan(0);
  });

  it('also repositions the node exactly, with no re-snap, when x/y are given (a corner resize)', () => {
    const state = stateWith({ nodes: [node({ x: 100, y: 100, width: 100, height: 50 })] });
    const next = diagramReducer(state, { type: 'resize', id: 'n1', width: 120, height: 64, x: 80, y: 90 });
    // y:90 is off the 8px grid - stored exactly, not snapped to 88. The
    // layer is what decides whether a resize's OWN delta is grid-quantized
    // (it is - see diagram-layer.test.tsx), which for a node that started
    // off-grid does not necessarily land back on an absolute grid line.
    expect(next.nodes[0]).toMatchObject({ x: 80, y: 90, width: 120, height: 64 });
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
    const next = diagramReducer(state, { type: 'setColor', ids: ['n1'], color: 'blue' });
    expect(next.nodes[0].color).toBe('blue');
  });

  // Matt's multi-selection follow-up: the Design panel recolours every
  // selected shape in one history step.
  it('sets the color on every given id, as one history step', () => {
    const state = stateWith({ nodes: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })] });
    const next = diagramReducer(state, { type: 'setColor', ids: ['a', 'b'], color: 'red' });
    expect(next.nodes.find((n) => n.id === 'a')?.color).toBe('red');
    expect(next.nodes.find((n) => n.id === 'b')?.color).toBe('red');
    expect(next.nodes.find((n) => n.id === 'c')?.color).toBe('neutral');
    expect(next.history.past).toHaveLength(state.history.past.length + 1);
  });

  it('is a no-op, with no history entry, when every given id already has that color', () => {
    const state = stateWith({ nodes: [node({ id: 'a', color: 'blue' }), node({ id: 'b', color: 'blue' })] });
    const next = diagramReducer(state, { type: 'setColor', ids: ['a', 'b'], color: 'blue' });
    expect(next).toBe(state);
  });

  it('ignores an unknown id without touching history', () => {
    const state = stateWith({ nodes: [node({ id: 'a' })] });
    const next = diagramReducer(state, { type: 'setColor', ids: ['missing'], color: 'blue' });
    expect(next).toBe(state);
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

describe('diagramReducer: setTextStyle', () => {
  it('sets textSize on a single id', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' })] });
    const next = diagramReducer(state, { type: 'setTextStyle', ids: ['n1'], textSize: 'large' });
    expect(next.nodes[0]).toMatchObject({ textSize: 'large' });
  });

  it('sets textFont and textColor together', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' })] });
    const next = diagramReducer(state, { type: 'setTextStyle', ids: ['n1'], textFont: 'mono', textColor: 'violet' });
    expect(next.nodes[0]).toMatchObject({ textFont: 'mono', textColor: 'violet' });
  });

  it('applies to every id given, as one history step', () => {
    const state = stateWith({ nodes: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })] });
    const next = diagramReducer(state, { type: 'setTextStyle', ids: ['a', 'b'], textSize: 'small' });
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ textSize: 'small' });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ textSize: 'small' });
    expect(next.nodes.find((n) => n.id === 'c')?.textSize).toBeUndefined();
    expect(next.history.past).toHaveLength(state.history.past.length + 1);
  });

  it('only changes the keys actually given, leaving the others alone', () => {
    const state = stateWith({ nodes: [node({ id: 'n1', textSize: 'large', textFont: 'serif', textColor: 'blue' })] });
    const next = diagramReducer(state, { type: 'setTextStyle', ids: ['n1'], textColor: 'red' });
    expect(next.nodes[0]).toMatchObject({ textSize: 'large', textFont: 'serif', textColor: 'red' });
  });

  it('ignores an edge id - text styling has no meaning for a connector', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' }), node({ id: 'n2' })], edges: [edge({ id: 'e1' })] });
    const next = diagramReducer(state, { type: 'setTextStyle', ids: ['e1'], textSize: 'small' });
    expect(next).toBe(state);
  });

  it('is a no-op, with no history entry, when every given value already matches', () => {
    const state = stateWith({ nodes: [node({ id: 'n1', textSize: 'small' })] });
    const next = diagramReducer(state, { type: 'setTextStyle', ids: ['n1'], textSize: 'small' });
    expect(next).toBe(state);
  });

  it('is a no-op for an unknown id', () => {
    const state = stateWith({ nodes: [node({ id: 'n1' })] });
    const next = diagramReducer(state, { type: 'setTextStyle', ids: ['missing'], textSize: 'small' });
    expect(next).toBe(state);
  });

  it('undoes as a single step back to no text style at all', () => {
    const state = stateWith({ nodes: [node({ id: 'a' }), node({ id: 'b' })] });
    const next = diagramReducer(state, { type: 'setTextStyle', ids: ['a', 'b'], textSize: 'large', textFont: 'mono' });
    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.nodes).toEqual(state.nodes);
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

describe('diagramReducer: reconnect', () => {
  const base = stateWith({
    nodes: [node({ id: 'n1' }), node({ id: 'n2' }), node({ id: 'n3' })],
    edges: [edge({ label: 'ships to', kind: 'curve', arrow: 'both' })], // n1/right -> n2/left
  });

  it('moves the target end to a different node/side, as one history step', () => {
    const next = diagramReducer(base, {
      type: 'reconnect',
      id: 'e1',
      end: 'target',
      endpoint: { nodeId: 'n3', side: 'top' },
    });
    expect(next.edges).toEqual([{ ...edge({ label: 'ships to', kind: 'curve', arrow: 'both' }), target: { nodeId: 'n3', side: 'top' } }]);
    expect(next.history.past).toHaveLength(base.history.past.length + 1);
  });

  it('moves the source end to a different node/side', () => {
    const next = diagramReducer(base, {
      type: 'reconnect',
      id: 'e1',
      end: 'source',
      endpoint: { nodeId: 'n3', side: 'bottom' },
    });
    expect(next.edges[0].source).toEqual({ nodeId: 'n3', side: 'bottom' });
    expect(next.edges[0].target).toEqual({ nodeId: 'n2', side: 'left' });
  });

  it('reconnects onto a frame (screenId endpoint), same as connect', () => {
    const next = diagramReducer(base, {
      type: 'reconnect',
      id: 'e1',
      end: 'target',
      endpoint: { screenId: 'screen1', side: 'left' },
    });
    expect(next.edges[0].target).toEqual({ screenId: 'screen1', side: 'left' });
  });

  it('carries label, kind and arrow over untouched', () => {
    const next = diagramReducer(base, {
      type: 'reconnect',
      id: 'e1',
      end: 'target',
      endpoint: { nodeId: 'n3', side: 'top' },
    });
    expect(next.edges[0].label).toBe('ships to');
    expect(next.edges[0].kind).toBe('curve');
    expect(next.edges[0].arrow).toBe('both');
  });

  it('is a no-op, with no history entry, when the endpoint is unchanged', () => {
    const next = diagramReducer(base, {
      type: 'reconnect',
      id: 'e1',
      end: 'target',
      endpoint: { nodeId: 'n2', side: 'left' },
    });
    expect(next).toBe(base);
  });

  it('a different side on the SAME node is a real change, not a no-op', () => {
    const next = diagramReducer(base, {
      type: 'reconnect',
      id: 'e1',
      end: 'target',
      endpoint: { nodeId: 'n2', side: 'top' },
    });
    expect(next).not.toBe(base);
    expect(next.edges[0].target).toEqual({ nodeId: 'n2', side: 'top' });
  });

  it('refuses a reconnect that would create a self-loop', () => {
    const next = diagramReducer(base, {
      type: 'reconnect',
      id: 'e1',
      end: 'target',
      endpoint: { nodeId: 'n1', side: 'bottom' },
    });
    expect(next).toBe(base);
  });

  it('refuses a reconnect that would duplicate an existing connector', () => {
    const withSecond = diagramReducer(base, {
      type: 'connect',
      edge: edge({ id: 'e2', source: { nodeId: 'n1', side: 'bottom' }, target: { nodeId: 'n3', side: 'top' } }),
    });
    // Moving e1's target onto n3/top would exactly duplicate e2 (same
    // source n1/bottom... no - e1's source stays n1/right, so this only
    // duplicates if BOTH endpoints match; use a same-endpoints reconnect
    // instead: move e1 fully onto e2's own pair by changing its source too.
    const movedSource = diagramReducer(withSecond, {
      type: 'reconnect',
      id: 'e1',
      end: 'source',
      endpoint: { nodeId: 'n1', side: 'bottom' },
    });
    const next = diagramReducer(movedSource, {
      type: 'reconnect',
      id: 'e1',
      end: 'target',
      endpoint: { nodeId: 'n3', side: 'top' },
    });
    expect(next).toBe(movedSource);
    expect(next.edges).toHaveLength(2);
  });

  it('ignores an unknown edge id without touching history', () => {
    const next = diagramReducer(base, {
      type: 'reconnect',
      id: 'missing',
      end: 'target',
      endpoint: { nodeId: 'n3', side: 'top' },
    });
    expect(next).toBe(base);
  });

  it('undo restores the old end', () => {
    const next = diagramReducer(base, {
      type: 'reconnect',
      id: 'e1',
      end: 'target',
      endpoint: { nodeId: 'n3', side: 'top' },
    });
    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.edges).toEqual(base.edges);
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

  // Review finding B: "a group with a single remaining member is not a
  // group" - deleting one member of a 2-member group must not leave the
  // survivor with a now-unique, orphaned groupId.
  it('clears the survivor\'s groupId when deleting drops its group to one member', () => {
    const state = stateWith({ nodes: [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })] });
    const next = diagramReducer(state, { type: 'delete', ids: ['a'] });
    expect('groupId' in next.nodes.find((n) => n.id === 'b')!).toBe(false);
  });

  it('is one undo step: undo restores both the deleted node and the survivor\'s groupId together', () => {
    const state = stateWith({ nodes: [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })] });
    const next = diagramReducer(state, { type: 'delete', ids: ['a'] });
    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.nodes).toEqual(state.nodes);
  });

  it('leaves a group of 3+ alone when it only drops to 2 members', () => {
    const state = stateWith({
      nodes: [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' }), node({ id: 'c', groupId: 'g1' })],
    });
    const next = diagramReducer(state, { type: 'delete', ids: ['a'] });
    expect(next.nodes.find((n) => n.id === 'b')?.groupId).toBe('g1');
    expect(next.nodes.find((n) => n.id === 'c')?.groupId).toBe('g1');
  });

  it('does not touch an unrelated group\'s membership', () => {
    const state = stateWith({
      nodes: [
        node({ id: 'a', groupId: 'g1' }),
        node({ id: 'b', groupId: 'g1' }),
        node({ id: 'x', groupId: 'g2' }),
        node({ id: 'y', groupId: 'g2' }),
      ],
    });
    const next = diagramReducer(state, { type: 'delete', ids: ['a'] });
    expect(next.nodes.find((n) => n.id === 'x')?.groupId).toBe('g2');
    expect(next.nodes.find((n) => n.id === 'y')?.groupId).toBe('g2');
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

  it('accepts an explicit offset (e.g. zero, for an option-drag duplicate)', () => {
    const state = stateWith({ nodes: [node({ id: 'n1', x: 40, y: 40 })] });
    const next = diagramReducer(state, {
      type: 'duplicate',
      pairs: [{ sourceId: 'n1', newId: 'copy1' }],
      offset: { x: 0, y: 0 },
    });
    expect(next.nodes.find((n) => n.id === 'copy1')).toMatchObject({ x: 40, y: 40 });
  });

  // Re-review finding 20 (should fix): the reducer used to re-snap the
  // copy's absolute position (snapToGrid(source.x + offset.x)), which
  // disagreed with the offset the caller actually asked for the moment the
  // source was off-grid - the same "layer snaps deltas, reducer stores
  // exact values" rule as `move` and (as of this fix wave) `resize`.
  it('adds the exact offset given, with no re-snap - the copy lands exactly where an option-drag ghost showed it', () => {
    const state = stateWith({ nodes: [node({ id: 'n1', x: 100, y: 100 })] });
    const next = diagramReducer(state, {
      type: 'duplicate',
      pairs: [{ sourceId: 'n1', newId: 'copy1' }],
      offset: { x: 24, y: 0 },
    });
    // Before the fix this landed at (128, 104): snapToGrid(124) rounds up to
    // 128, and snapToGrid(100) (the y the caller never asked to move at
    // all) rounds up to 104 - a purely horizontal drag moved the copy
    // vertically too.
    expect(next.nodes.find((n) => n.id === 'copy1')).toMatchObject({ x: 124, y: 100 });
  });

  // Spec section 9 (Build step 1: "duplicate/quickAdd/cloneDiagram carry
  // the three fields") - already true today since this action copies the
  // source node with a plain object spread, but pinned down with its own
  // test so a future refactor of this action cannot silently drop it.
  it('carries the source shape own text size, font and color to the copy', () => {
    const state = stateWith({ nodes: [node({ id: 'n1', textSize: 'small', textFont: 'serif', textColor: 'black' })] });
    const next = diagramReducer(state, { type: 'duplicate', pairs: [{ sourceId: 'n1', newId: 'copy1' }] });
    expect(next.nodes.find((n) => n.id === 'copy1')).toMatchObject({ textSize: 'small', textFont: 'serif', textColor: 'black' });
  });

  it('keeps two duplicated shapes the same distance apart as their sources, even off the grid', () => {
    const state = stateWith({
      nodes: [node({ id: 'n1', x: 100, y: 0 }), node({ id: 'n2', x: 104, y: 0 })],
    });
    const next = diagramReducer(state, {
      type: 'duplicate',
      pairs: [
        { sourceId: 'n1', newId: 'copy1' },
        { sourceId: 'n2', newId: 'copy2' },
      ],
      offset: { x: 20, y: 0 },
    });
    const copy1 = next.nodes.find((n) => n.id === 'copy1')!;
    const copy2 = next.nodes.find((n) => n.id === 'copy2')!;
    expect(copy2.x - copy1.x).toBe(4);
  });

  it("Cmd+D's default offset is exactly 16, even from an off-grid source", () => {
    const state = stateWith({ nodes: [node({ id: 'n1', x: 100, y: 100 })] });
    // No `offset` given - the default DUPLICATE_OFFSET path Cmd+D uses.
    const next = diagramReducer(state, { type: 'duplicate', pairs: [{ sourceId: 'n1', newId: 'copy1' }] });
    // Before the fix this landed at (120, 120): snapToGrid(116) rounds up
    // to 120, an offset of 20, not the 16 Cmd+D has always advertised.
    expect(next.nodes.find((n) => n.id === 'copy1')).toMatchObject({ x: 116, y: 116 });
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

  // Review finding 8: a no-op reorder (the node is already at that end)
  // still pushed a history entry, so the next Cmd+Z appeared to do nothing
  // and threw away the redo stack.
  it('is a no-op, no history entry, when the node is already at that end', () => {
    const state = stateWith({ nodes: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })] });
    const next = diagramReducer(state, { type: 'reorder', ids: ['c'], to: 'front' });
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
  // x/y/width/height all chosen as clean multiples of 8, purely so the
  // comments below read as round numbers - quickAdd applies its placement
  // exactly regardless (re-review 2 finding 28), so an off-grid source
  // works identically; see the dedicated off-grid test further down.
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

  // Re-review 2 finding 28 (should fix): quickAdd used to snapToGrid its
  // x/y, which disagreed with its own "64px gap, aligned on the other
  // axis" promise (spec section 7) the moment the source was off-grid -
  // a 1px nudge is now a first-class operation (Matt's nudge rule), so
  // this is the common case, not an edge case. The gap/alignment math
  // above is already exact integer arithmetic on the source's own
  // position - nothing here needed rounding, only the snap needed removing.
  it('applies its placement exactly from an off-grid source - no jog in the connector', () => {
    const offGridSource = node({ id: 'src', x: 101, y: 101, width: 128, height: 64 });
    const state = stateWith({ nodes: [offGridSource] });
    const next = diagramReducer(state, {
      type: 'quickAdd',
      sourceId: 'src',
      side: 'right',
      newNodeId: 'new1',
      newEdgeId: 'edge1',
    });
    // 101 (source x) + 128 (source width) + 64 (gap) = 293, aligned
    // exactly on y (101) - before this fix, snapToGrid rounded both to
    // (296, 104), a 3px jog between the new shape and the one it is
    // supposed to line up with.
    expect(next.nodes.find((n) => n.id === 'new1')).toMatchObject({ x: 293, y: 101 });
  });

  it('is a no-op for an unknown source', () => {
    const state = stateWith({ nodes: [] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'missing', side: 'right', newNodeId: 'new1', newEdgeId: 'edge1' });
    expect(next).toBe(state);
  });

  // Review finding 19: quickAdd did not refuse an already-used id the way
  // add does.
  it('is a no-op when newNodeId already exists', () => {
    const state = stateWith({ nodes: [source, node({ id: 'new1' })] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'src', side: 'right', newNodeId: 'new1', newEdgeId: 'edge1' });
    expect(next).toBe(state);
  });

  it('is a no-op when newEdgeId already exists', () => {
    const state = stateWith({
      nodes: [source, node({ id: 'other' })],
      edges: [edge({ id: 'edge1', source: { nodeId: 'src' }, target: { nodeId: 'other' } })],
    });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'src', side: 'right', newNodeId: 'new1', newEdgeId: 'edge1' });
    expect(next).toBe(state);
  });

  it('is a single undo step for both the new node and its edge', () => {
    const state = stateWith({ nodes: [source] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'src', side: 'right', newNodeId: 'new1', newEdgeId: 'edge1' });
    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.nodes).toEqual([source]);
    expect(undone.edges).toEqual([]);
  });

  // Spec section 9 (Build step 1: "duplicate/quickAdd/cloneDiagram carry
  // the three fields").
  it('carries the source shape own text size, font and color to the new shape', () => {
    const styledSource = node({ id: 'src', x: 96, y: 96, width: 128, height: 64, textSize: 'large', textFont: 'mono', textColor: 'violet' });
    const state = stateWith({ nodes: [styledSource] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'src', side: 'right', newNodeId: 'new1', newEdgeId: 'edge1' });
    expect(next.nodes.find((n) => n.id === 'new1')).toMatchObject({ textSize: 'large', textFont: 'mono', textColor: 'violet' });
  });

  it('leaves the new shape without text style when the source has none', () => {
    const state = stateWith({ nodes: [source] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'src', side: 'right', newNodeId: 'new1', newEdgeId: 'edge1' });
    const created = next.nodes.find((n) => n.id === 'new1');
    expect(created?.textSize).toBeUndefined();
    expect(created?.textFont).toBeUndefined();
    expect(created?.textColor).toBeUndefined();
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

  it('centers horizontally on the selection bounding box', () => {
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

  // Review finding 8: aligning shapes that are already aligned still pushed
  // a history entry, so Cmd+Z appeared to do nothing.
  it('is a no-op, no history entry, when every shape is already aligned', () => {
    const alreadyLeft = node({ id: 'x', x: 0, y: 0, width: 48, height: 32 });
    const alreadyLeftToo = node({ id: 'y', x: 0, y: 50, width: 16, height: 96 });
    const state = stateWith({ nodes: [alreadyLeft, alreadyLeftToo] });
    const next = diagramReducer(state, { type: 'align', ids: ['x', 'y'], mode: 'left' });
    expect(next).toBe(state);
  });

  // Re-review 2 finding 27 (should fix): centering an odd width/height
  // difference divides by 2, which the previous grid-snap used to round
  // away as a side effect - canvas coordinates are integers (spec section
  // 2), so centerX/centerY round their own result now that nothing else
  // does.
  it('rounds a fractional centerX result to the nearest integer (an odd width difference)', () => {
    const wide = node({ id: 'a', x: 0, y: 0, width: 100, height: 50 });
    const narrow = node({ id: 'b', x: 0, y: 0, width: 45, height: 50 });
    const state = stateWith({ nodes: [wide, narrow] });
    const next = diagramReducer(state, { type: 'align', ids: ['a', 'b'], mode: 'centerX' });
    // Bounding box is 0..100 (a's own right edge is the wider of the two);
    // centering b (width 45) in it is (100-45)/2 = 27.5.
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 28 });
  });

  it('rounds a fractional centerY result to the nearest integer (an odd height difference)', () => {
    const tall = node({ id: 'a', x: 0, y: 0, width: 40, height: 100 });
    const short = node({ id: 'b', x: 0, y: 0, width: 40, height: 45 });
    const state = stateWith({ nodes: [tall, short] });
    const next = diagramReducer(state, { type: 'align', ids: ['a', 'b'], mode: 'centerY' });
    // (100-45)/2 = 27.5.
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ y: 28 });
  });

  // Re-review finding 21: align no longer snaps its result to the grid
  // (Figma behaviour - shapes can sit off-grid now, e.g. after a 1px
  // nudge, and "align" should not silently un-nudge them by up to 4px).
  it('lands exactly on the bounding box edge, off the grid, with no snap of its own', () => {
    const off1 = node({ id: 'x', x: 3, y: 0, width: 48, height: 32 });
    const off2 = node({ id: 'y', x: 83, y: 0, width: 16, height: 96 });
    const state = stateWith({ nodes: [off1, off2] });
    const next = diagramReducer(state, { type: 'align', ids: ['x', 'y'], mode: 'left' });
    // Bounding box left edge is 3 (off the grid) - before this fix,
    // snapToGrid(3) rounded down to 0 for both shapes.
    expect(next.nodes.find((n) => n.id === 'x')).toMatchObject({ x: 3 });
    expect(next.nodes.find((n) => n.id === 'y')).toMatchObject({ x: 3 });
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

  // Review finding 8: distributing shapes already evenly spaced still
  // pushed a history entry.
  it('is a no-op, no history entry, when already evenly distributed', () => {
    const evenA = node({ id: 'a', x: 0, y: 0, width: 40, height: 20 });
    const evenB = node({ id: 'b', x: 104, y: 0, width: 40, height: 20 });
    const evenC = node({ id: 'c', x: 208, y: 0, width: 40, height: 20 });
    const state = stateWith({ nodes: [evenA, evenB, evenC] });
    const next = diagramReducer(state, { type: 'distribute', ids: ['a', 'b', 'c'], axis: 'horizontal' });
    expect(next).toBe(state);
  });

  // Review finding 9: distribute picked its span from whichever shape
  // sorted last by position, not from the true extents - a wide interior
  // shape (b) could extend further right than the "last" shape (c),
  // undercounting the span and throwing c past a on the other side.
  it('uses extents (min start to max end) for the span, so a wide shape does not throw another one past the first', () => {
    const wideA = node({ id: 'a', x: 0, y: 0, width: 40, height: 20 });
    const wideB = node({ id: 'b', x: 60, y: 0, width: 200, height: 20 }); // right edge 260, the widest extent
    const wideC = node({ id: 'c', x: 100, y: 0, width: 40, height: 20 }); // right edge 140, sorts last by x
    const state = stateWith({ nodes: [wideA, wideB, wideC] });
    const next = diagramReducer(state, { type: 'distribute', ids: ['a', 'b', 'c'], axis: 'horizontal' });
    // b has the max right edge and stays fixed, same as a (min start);
    // c is the only interior shape and lands directly after a - the gap
    // is clamped to 0 since the three shapes do not fit in b's span.
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 0 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 60 });
    expect(next.nodes.find((n) => n.id === 'c')).toMatchObject({ x: 40 });
  });

  // Re-review finding 21: distribute no longer snaps an interior shape's
  // computed position to the grid.
  it('places an interior shape at its exact computed position, off the grid, with no snap of its own', () => {
    const wideA = node({ id: 'a', x: 0, y: 0, width: 10, height: 20 });
    const middle = node({ id: 'b', x: 20, y: 0, width: 10, height: 20 });
    const wideC = node({ id: 'c', x: 100, y: 0, width: 10, height: 20 }); // right edge 110, the anchor
    const state = stateWith({ nodes: [wideA, middle, wideC] });
    const next = diagramReducer(state, { type: 'distribute', ids: ['a', 'b', 'c'], axis: 'horizontal' });
    // span 110, total size 30, gap (110-30)/2=40; b lands at 0+10+40=50,
    // not a multiple of 8 - before this fix, snapToGrid(50) rounded down
    // to 48.
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 50 });
  });

  // Re-review 2 finding 27 (should fix): a gap of (span - totalSize) /
  // (n - 1) is not always an integer - canvas coordinates are integers
  // (spec section 2), so each interior shape's WRITTEN position rounds,
  // while the running cursor keeps the exact fractional total for the
  // NEXT shape's math (so gaps stay as even as integer coordinates allow,
  // rather than compounding rounding error from one shape to the next).
  it('rounds each interior shape\'s position when the gap is not an integer', () => {
    const first = node({ id: 'a', x: 0, y: 0, width: 40, height: 20 });
    const m1 = node({ id: 'b', x: 60, y: 0, width: 40, height: 20 });
    const m2 = node({ id: 'c', x: 120, y: 0, width: 40, height: 20 });
    const last = node({ id: 'd', x: 169, y: 0, width: 40, height: 20 }); // right edge 209, the anchor
    const state = stateWith({ nodes: [first, m1, m2, last] });
    const next = diagramReducer(state, { type: 'distribute', ids: ['a', 'b', 'c', 'd'], axis: 'horizontal' });
    // span 209, total width 160, gap (209-160)/3 = 16.333...
    // b: 0+40+16.333...  = 56.333...  -> rounds to 56
    // c: 56.333...+40+16.333... = 112.666... -> rounds to 113
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 56 });
    expect(next.nodes.find((n) => n.id === 'c')).toMatchObject({ x: 113 });
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

  it('selectAll selects every node then every edge', () => {
    const n1 = node({ id: 'n1' });
    const n2 = node({ id: 'n2' });
    const e1 = edge({ id: 'e1' });
    const e2 = edge({ id: 'e2' });
    const state = stateWith({ nodes: [n1, n2], edges: [e1, e2] });
    const selected = diagramReducer(state, { type: 'selectAll' });
    expect(selected.selection).toEqual([
      { type: 'node', id: 'n1' },
      { type: 'node', id: 'n2' },
      { type: 'edge', id: 'e1' },
      { type: 'edge', id: 'e2' },
    ]);
    // No history entry for selecting.
    expect(diagramReducer(selected, { type: 'undo' })).toBe(selected);
  });

  it('selectAll is a no-op when already fully selected', () => {
    const n1 = node({ id: 'n1' });
    const e1 = edge({ id: 'e1' });
    const state = {
      ...stateWith({ nodes: [n1], edges: [e1] }),
      selection: [
        { type: 'node' as const, id: 'n1' },
        { type: 'edge' as const, id: 'e1' },
      ],
    };
    const next = diagramReducer(state, { type: 'selectAll' });
    expect(next).toBe(state);
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

describe('diagramReducer: immutability (review finding 12/10)', () => {
  function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object') {
      Object.getOwnPropertyNames(value as object).forEach((key) => deepFreeze((value as Record<string, unknown>)[key]));
      Object.freeze(value);
    }
    return value;
  }

  it('never mutates a deep-frozen input state for any of the five new actions', () => {
    const frozen = deepFreeze(
      stateWith({
        nodes: [
          node({ id: 'a', x: 0, y: 0, width: 40, height: 40 }),
          node({ id: 'b', x: 100, y: 100, width: 40, height: 40 }),
          node({ id: 'c', x: 200, y: 0, width: 40, height: 40 }),
        ],
        edges: [edge({ id: 'e1', source: { nodeId: 'a' }, target: { nodeId: 'b' } })],
      }),
    );
    expect(() => diagramReducer(frozen, { type: 'reorder', ids: ['a'], to: 'front' })).not.toThrow();
    expect(() =>
      diagramReducer(frozen, { type: 'quickAdd', sourceId: 'a', side: 'right', newNodeId: 'x1', newEdgeId: 'x2' }),
    ).not.toThrow();
    expect(() => diagramReducer(frozen, { type: 'align', ids: ['a', 'b'], mode: 'left' })).not.toThrow();
    expect(() => diagramReducer(frozen, { type: 'distribute', ids: ['a', 'b', 'c'], axis: 'horizontal' })).not.toThrow();
    expect(() =>
      diagramReducer(frozen, {
        type: 'duplicate',
        pairs: [{ sourceId: 'a', newId: 'copy1' }],
        edgePairs: [{ sourceId: 'e1', newId: 'copy2' }],
      }),
    ).not.toThrow();
  });
});

describe('diagramReducer: duplicate with edgePairs, then undo (review finding 10/12)', () => {
  it('undo removes both the copied nodes and the copied connector together, in one step', () => {
    const state = stateWith({
      nodes: [node({ id: 'a' }), node({ id: 'b' })],
      edges: [edge({ id: 'e1', source: { nodeId: 'a' }, target: { nodeId: 'b' } })],
    });
    const next = diagramReducer(state, {
      type: 'duplicate',
      pairs: [
        { sourceId: 'a', newId: 'copyA' },
        { sourceId: 'b', newId: 'copyB' },
      ],
      edgePairs: [{ sourceId: 'e1', newId: 'copyE' }],
    });
    expect(next.nodes).toHaveLength(4);
    expect(next.edges).toHaveLength(2);

    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.nodes).toEqual(state.nodes);
    expect(undone.edges).toEqual(state.edges);
  });
});

describe('duplicatePairs', () => {
  // Review finding 7: the "connector whose both endpoints are in the
  // duplicated set" filter existed three times (diagram-layer.tsx twice,
  // workbench.tsx once) - one hand-copied re-implementation apiece. This is
  // the single pure, tested implementation all three now call.
  it('mints a pair for each existing id and an edgePair for a connector wholly inside the set', () => {
    let n = 0;
    const makeId = () => `new${++n}`;
    const state = {
      nodes: [node({ id: 'a' }), node({ id: 'b' })],
      edges: [edge({ id: 'e1', source: { nodeId: 'a', side: 'right' }, target: { nodeId: 'b', side: 'left' } })],
    };
    const result = duplicatePairs(state, ['a', 'b'], makeId);
    expect(result.pairs).toEqual([
      { sourceId: 'a', newId: 'new1' },
      { sourceId: 'b', newId: 'new2' },
    ]);
    expect(result.edgePairs).toEqual([{ sourceId: 'e1', newId: 'new3' }]);
  });

  it('skips an id that does not resolve to an existing node', () => {
    const state = { nodes: [node({ id: 'a' })], edges: [] };
    const result = duplicatePairs(state, ['a', 'missing'], () => 'x');
    expect(result.pairs).toEqual([{ sourceId: 'a', newId: 'x' }]);
  });

  it('does not pair a connector whose other endpoint is outside the given ids', () => {
    let n = 0;
    const makeId = () => `new${++n}`;
    const state = {
      nodes: [node({ id: 'a' }), node({ id: 'b' })],
      edges: [edge({ id: 'e1', source: { nodeId: 'a' }, target: { nodeId: 'b' } })],
    };
    const result = duplicatePairs(state, ['a'], makeId);
    expect(result.edgePairs).toEqual([]);
  });

  it('never pairs a connector with a frame (screenId) endpoint', () => {
    let n = 0;
    const makeId = () => `new${++n}`;
    const state = {
      nodes: [node({ id: 'a' })],
      edges: [edge({ id: 'e1', source: { nodeId: 'a' }, target: { screenId: 's1' } })],
    };
    const result = duplicatePairs(state, ['a'], makeId);
    expect(result.edgePairs).toEqual([]);
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

  // Spec section 9 (Build step 1: "duplicate/quickAdd/cloneDiagram carry
  // the three fields") - already true today since this function copies
  // each node with a plain object spread, but pinned down with its own
  // test so a future refactor cannot silently drop it.
  it('carries a node own text size, font and color into the copy', () => {
    const diagram = {
      nodes: [
        { id: 'a', kind: 'rect' as const, x: 0, y: 0, width: 160, height: 80, text: 'A', color: 'neutral' as const, textSize: 'large' as const, textFont: 'mono' as const, textColor: 'red' as const },
      ],
      edges: [],
    };
    const copy = cloneDiagram(diagram, {}, () => 'new1');
    expect(copy.nodes[0]).toMatchObject({ textSize: 'large', textFont: 'mono', textColor: 'red' });
  });

  // Spec section 10: "cloneDiagram keeps group ids consistent" - every
  // member of the SAME old group gets the SAME new group id, not each its
  // own random one.
  it('gives every copied member of the same group the same fresh group id', () => {
    const diagram = {
      nodes: [
        node({ id: 'a', groupId: 'g1' }),
        node({ id: 'b', x: 300, groupId: 'g1' }),
        node({ id: 'c', x: 600 }),
      ],
      edges: [],
    };
    let n = 0;
    const makeId = () => `new${++n}`;
    const copy = cloneDiagram(diagram, {}, makeId);
    const [copyA, copyB, copyC] = copy.nodes;
    expect(copyA.groupId).toBeDefined();
    expect(copyA.groupId).toBe(copyB.groupId);
    expect(copyA.groupId).not.toBe('g1');
    expect(copyC.groupId).toBeUndefined();
  });
});

describe('diagramReducer: group', () => {
  it('sets a groupId on every one of two or more given nodes', () => {
    const state = stateWith({ nodes: [node({ id: 'a' }), node({ id: 'b' })] });
    const next = diagramReducer(state, { type: 'group', ids: ['a', 'b'], groupId: 'g1' });
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ groupId: 'g1' });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ groupId: 'g1' });
  });

  it('leaves the current selection exactly as it was', () => {
    const state = stateWith({
      nodes: [node({ id: 'a' }), node({ id: 'b' })],
      selection: [
        { type: 'node' as const, id: 'a' },
        { type: 'node' as const, id: 'b' },
      ],
    });
    const next = diagramReducer(state, { type: 'group', ids: ['a', 'b'], groupId: 'g1' });
    expect(next.selection).toEqual(state.selection);
  });

  it('overwrites an existing groupId - regrouping a selection that already contains grouped shapes produces one flat group', () => {
    const state = stateWith({
      nodes: [node({ id: 'a', groupId: 'old' }), node({ id: 'b', groupId: 'old' }), node({ id: 'c' })],
    });
    const next = diagramReducer(state, { type: 'group', ids: ['a', 'b', 'c'], groupId: 'new' });
    expect(next.nodes.map((n) => n.groupId)).toEqual(['new', 'new', 'new']);
  });

  it('is a no-op with fewer than two ids', () => {
    const state = stateWith({ nodes: [node({ id: 'a' })] });
    const next = diagramReducer(state, { type: 'group', ids: ['a'], groupId: 'g1' });
    expect(next).toBe(state);
  });

  it('is a no-op when fewer than two ids resolve to real nodes', () => {
    const state = stateWith({ nodes: [node({ id: 'a' })] });
    const next = diagramReducer(state, { type: 'group', ids: ['a', 'missing'], groupId: 'g1' });
    expect(next).toBe(state);
  });

  it('is a no-op, no history entry, when every node already has this exact groupId', () => {
    const state = stateWith({ nodes: [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })] });
    const next = diagramReducer(state, { type: 'group', ids: ['a', 'b'], groupId: 'g1' });
    expect(next).toBe(state);
  });

  it('is one undo step', () => {
    const state = stateWith({ nodes: [node({ id: 'a' }), node({ id: 'b' })] });
    const next = diagramReducer(state, { type: 'group', ids: ['a', 'b'], groupId: 'g1' });
    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.nodes.map((n) => n.groupId)).toEqual([undefined, undefined]);
  });

  // Review finding B (the "move away" case): "a group with a single
  // remaining member is not a group" also applies when regrouping a
  // SUBSET of an existing group's members strands the rest at exactly one.
  it('clears the groupId of a lone member stranded by regrouping the rest of its old group elsewhere', () => {
    const state = stateWith({
      nodes: [node({ id: 'a', groupId: 'old' }), node({ id: 'b', groupId: 'old' }), node({ id: 'c', groupId: 'old' })],
    });
    const next = diagramReducer(state, { type: 'group', ids: ['a', 'b'], groupId: 'new' });
    expect(next.nodes.find((n) => n.id === 'a')?.groupId).toBe('new');
    expect(next.nodes.find((n) => n.id === 'b')?.groupId).toBe('new');
    expect('groupId' in next.nodes.find((n) => n.id === 'c')!).toBe(false);
  });

  it('does not strand a lone member when the old group still has 2+ left behind', () => {
    const state = stateWith({
      nodes: [
        node({ id: 'a', groupId: 'old' }),
        node({ id: 'b', groupId: 'old' }),
        node({ id: 'c', groupId: 'old' }),
        node({ id: 'd', groupId: 'old' }),
      ],
    });
    const next = diagramReducer(state, { type: 'group', ids: ['a', 'b'], groupId: 'new' });
    expect(next.nodes.find((n) => n.id === 'c')?.groupId).toBe('old');
    expect(next.nodes.find((n) => n.id === 'd')?.groupId).toBe('old');
  });
});

describe('diagramReducer: ungroup', () => {
  it('clears groupId from every node that carries it', () => {
    const state = stateWith({
      nodes: [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' }), node({ id: 'c', groupId: 'other' })],
    });
    const next = diagramReducer(state, { type: 'ungroup', groupId: 'g1' });
    expect(next.nodes.find((n) => n.id === 'a')?.groupId).toBeUndefined();
    expect(next.nodes.find((n) => n.id === 'b')?.groupId).toBeUndefined();
    expect(next.nodes.find((n) => n.id === 'c')?.groupId).toBe('other');
  });

  // "Absent stays absent" - not present with an `undefined` value, same
  // convention as textSize/textFont/textColor elsewhere in this module.
  it('removes the groupId key entirely rather than setting it to undefined', () => {
    const state = stateWith({ nodes: [node({ id: 'a', groupId: 'g1' })] });
    const next = diagramReducer(state, { type: 'ungroup', groupId: 'g1' });
    expect('groupId' in next.nodes[0]).toBe(false);
  });

  it('leaves the current selection exactly as it was', () => {
    const state = stateWith({
      nodes: [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })],
      selection: [
        { type: 'node' as const, id: 'a' },
        { type: 'node' as const, id: 'b' },
      ],
    });
    const next = diagramReducer(state, { type: 'ungroup', groupId: 'g1' });
    expect(next.selection).toEqual(state.selection);
  });

  it('is a no-op, no history entry, when no node carries this groupId', () => {
    const state = stateWith({ nodes: [node({ id: 'a', groupId: 'other' })] });
    const next = diagramReducer(state, { type: 'ungroup', groupId: 'g1' });
    expect(next).toBe(state);
  });

  it('is one undo step', () => {
    const state = stateWith({ nodes: [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })] });
    const next = diagramReducer(state, { type: 'ungroup', groupId: 'g1' });
    const undone = diagramReducer(next, { type: 'undo' });
    expect(undone.nodes.map((n) => n.groupId)).toEqual(['g1', 'g1']);
  });
});

describe('diagramReducer: duplicate with groupIdMap (spec section 10)', () => {
  it('gives copies of a whole duplicated group one fresh, shared group id', () => {
    const state = stateWith({ nodes: [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })] });
    const next = diagramReducer(state, {
      type: 'duplicate',
      pairs: [
        { sourceId: 'a', newId: 'copyA' },
        { sourceId: 'b', newId: 'copyB' },
      ],
      groupIdMap: { g1: 'freshGroup' },
    });
    const copyA = next.nodes.find((n) => n.id === 'copyA');
    const copyB = next.nodes.find((n) => n.id === 'copyB');
    expect(copyA?.groupId).toBe('freshGroup');
    expect(copyB?.groupId).toBe('freshGroup');
    // The originals keep their own, unrelated group id.
    expect(next.nodes.find((n) => n.id === 'a')?.groupId).toBe('g1');
  });

  it('leaves a copy ungrouped when its source had a groupId with no entry in groupIdMap (a partial-group duplicate)', () => {
    const state = stateWith({ nodes: [node({ id: 'a', groupId: 'g1' })] });
    const next = diagramReducer(state, {
      type: 'duplicate',
      pairs: [{ sourceId: 'a', newId: 'copyA' }],
      groupIdMap: {},
    });
    expect('groupId' in next.nodes.find((n) => n.id === 'copyA')!).toBe(false);
  });

  it('leaves a copy of an ungrouped source ungrouped when no groupIdMap is given at all', () => {
    const state = stateWith({ nodes: [node({ id: 'a' })] });
    const next = diagramReducer(state, { type: 'duplicate', pairs: [{ sourceId: 'a', newId: 'copyA' }] });
    expect('groupId' in next.nodes.find((n) => n.id === 'copyA')!).toBe(false);
  });
});

describe('duplicatePairs: groupIdMap', () => {
  it('mints one fresh group id for a group whose every member is in ids', () => {
    let n = 0;
    const makeId = () => `new${++n}`;
    const state = { nodes: [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })], edges: [] };
    const result = duplicatePairs(state, ['a', 'b'], makeId);
    expect(result.groupIdMap.g1).toBeDefined();
    expect(result.groupIdMap.g1).not.toBe('g1');
  });

  it('does not mint a group id for a group only partly represented in ids', () => {
    let n = 0;
    const makeId = () => `new${++n}`;
    const state = { nodes: [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })], edges: [] };
    const result = duplicatePairs(state, ['a'], makeId);
    expect(result.groupIdMap.g1).toBeUndefined();
  });

  it('is an empty object when nothing in ids is grouped', () => {
    const state = { nodes: [node({ id: 'a' })], edges: [] };
    const result = duplicatePairs(state, ['a'], () => 'x');
    expect(result.groupIdMap).toEqual({});
  });
});

describe('expandToGroups', () => {
  it('expands a single grouped node id to every member of its group', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' }), node({ id: 'c' })];
    const result = expandToGroups(nodes, [], ['a']);
    expect(result).toEqual(
      expect.arrayContaining([
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('includes every connector whose both endpoints end up in the expanded set', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })];
    const edges = [edge({ id: 'e1', source: { nodeId: 'a' }, target: { nodeId: 'b' } })];
    const result = expandToGroups(nodes, edges, ['a']);
    expect(result).toContainEqual({ type: 'edge', id: 'e1' });
  });

  it('does not include a connector to a node outside the expanded set', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' }), node({ id: 'c' })];
    const edges = [edge({ id: 'e1', source: { nodeId: 'a' }, target: { nodeId: 'c' } })];
    const result = expandToGroups(nodes, edges, ['a']);
    expect(result.some((item) => item.type === 'edge')).toBe(false);
  });

  it('passes an ungrouped id through unexpanded, with no edges of its own', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b' })];
    const edges = [edge({ id: 'e1', source: { nodeId: 'a' }, target: { nodeId: 'b' } })];
    const result = expandToGroups(nodes, edges, ['a']);
    expect(result).toEqual([{ type: 'node', id: 'a' }]);
  });

  it('unions the expansion of several ids, some grouped and some not', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' }), node({ id: 'c' })];
    const result = expandToGroups(nodes, [], ['a', 'c']);
    expect(result.map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('diagramReducer: quickAdd never copies groupId', () => {
  // Spec section 10: "Quick-add on a grouped shape adds the new shape
  // outside the group" - already true today since the quickAdd case builds
  // `newNode` field by field rather than spreading `source` (unlike
  // duplicate/cloneDiagram, which DO carry group membership on purpose) -
  // pinned down here so a future refactor of quickAdd cannot silently
  // start copying it.
  it('the new node has no groupId even when the source is grouped', () => {
    const state = stateWith({ nodes: [node({ id: 'a', groupId: 'g1' })] });
    const next = diagramReducer(state, { type: 'quickAdd', sourceId: 'a', side: 'right', newNodeId: 'new1', newEdgeId: 'edge1' });
    const newNode = next.nodes.find((n) => n.id === 'new1');
    expect(newNode).toBeDefined();
    expect('groupId' in newNode!).toBe(false);
  });
});

describe('edgeBounds', () => {
  it('is the union bounding box of the two endpoint node boxes', () => {
    const nodes = [
      node({ id: 'a', x: 0, y: 0, width: 40, height: 40 }),
      node({ id: 'b', x: 100, y: 100, width: 20, height: 20 }),
    ];
    const result = edgeBounds(edge({ source: { nodeId: 'a' }, target: { nodeId: 'b' } }), nodes, []);
    expect(result).toEqual({ x: 0, y: 0, width: 120, height: 120 });
  });

  it('resolves a frame (screenId) endpoint from the frames list', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 40, height: 40 })];
    const frames = [{ id: 's1', x: 200, y: 0, width: 100, height: 50 }];
    const result = edgeBounds(edge({ source: { nodeId: 'a' }, target: { screenId: 's1' } }), nodes, frames);
    expect(result).toEqual({ x: 0, y: 0, width: 300, height: 50 });
  });

  it('is null when an endpoint does not resolve to any known node or frame', () => {
    const nodes = [node({ id: 'a' })];
    const result = edgeBounds(edge({ source: { nodeId: 'a' }, target: { nodeId: 'missing' } }), nodes, []);
    expect(result).toBeNull();
  });

  // Review finding D: for a `curve` connector, the union of the two
  // endpoint boxes is not a safe bound - the bezier control points can
  // bow well outside it (geometry.ts's BEZIER_CURVATURE grows the offset
  // *linearly with distance*, unboundedly, not just at short spacing).
  // Two same-height boxes 200px apart, connected top-to-top (a realistic
  // "route over the top" case, not contrived): the curve peaks well above
  // both boxes' own top edge.
  describe('curve connectors use the actual bezier control points', () => {
    const a = node({ id: 'a', x: 0, y: 100, width: 40, height: 40 });
    const b = node({ id: 'b', x: 200, y: 100, width: 40, height: 40 });
    const curveEdge = edge({ source: { nodeId: 'a', side: 'top' }, target: { nodeId: 'b', side: 'top' }, kind: 'curve' });

    it('extends beyond the plain union of the two endpoint boxes', () => {
      const unionOfBoxes = { x: 0, y: 100, width: 240, height: 40 };
      const result = edgeBounds(curveEdge, [a, b], []);
      expect(result).not.toBeNull();
      // The curve bows upward (smaller y) past the boxes' own top edge -
      // the naive box union would have missed this entirely.
      expect(result!.y).toBeLessThan(unionOfBoxes.y);
    });

    it('matches the exact control-polygon bounds (both handles plus both bezier control points)', () => {
      // distance = 200 (handle to handle); magnitude = max(200*0.28, 20) = 56.
      // Handles at (20,100) and (220,100); both control points offset -56 in
      // y (the 'top' side): (20,44) and (220,44). toBeCloseTo, not toEqual:
      // Math.hypot's own floating-point rounding of the 200 distance can
      // land a fraction of a unit off an exact integer.
      const result = edgeBounds(curveEdge, [a, b], []);
      expect(result).not.toBeNull();
      expect(result!.x).toBeCloseTo(20);
      expect(result!.y).toBeCloseTo(44);
      expect(result!.width).toBeCloseTo(200);
      expect(result!.height).toBeCloseTo(56);
    });

    it('still returns the plain box union for a non-curve edge between the same two shapes', () => {
      const stepEdge = edge({ source: { nodeId: 'a', side: 'top' }, target: { nodeId: 'b', side: 'top' }, kind: 'step' });
      const result = edgeBounds(stepEdge, [a, b], []);
      expect(result).toEqual({ x: 0, y: 100, width: 240, height: 40 });
    });
  });
});

// Review finding A: "a group is selected" must mean every member of that
// group is selected and nothing else - not merely "every selected node
// happens to agree on one groupId," which is trivially true for a single
// selected node too (an array of one element trivially satisfies
// `.every(...)`). Shared by diagram-layer.tsx's Ungroup menu item and
// workbench.tsx's Cmd+Shift+G handler so the two can never independently
// get this wrong the way they both did before this fix.
describe('selectedGroupId', () => {
  it('returns the group id when the selection is exactly one whole group', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })];
    const selection = [
      { type: 'node' as const, id: 'a' },
      { type: 'node' as const, id: 'b' },
    ];
    expect(selectedGroupId(nodes, selection)).toBe('g1');
  });

  it('is undefined for a single selected member of a larger group (the "entered" case, and a bare right-click)', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })];
    expect(selectedGroupId(nodes, [{ type: 'node', id: 'a' }])).toBeUndefined();
  });

  it('is undefined when the selection also includes a node outside the group', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' }), node({ id: 'c' })];
    const selection = [
      { type: 'node' as const, id: 'a' },
      { type: 'node' as const, id: 'b' },
      { type: 'node' as const, id: 'c' },
    ];
    expect(selectedGroupId(nodes, selection)).toBeUndefined();
  });

  it('is undefined for an ungrouped selection', () => {
    expect(selectedGroupId([node({ id: 'a' })], [{ type: 'node', id: 'a' }])).toBeUndefined();
  });

  it('is undefined for an empty selection', () => {
    expect(selectedGroupId([node({ id: 'a', groupId: 'g1' })], [])).toBeUndefined();
  });

  it('still recognizes the whole group when an internal connector is also selected alongside every member', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', groupId: 'g1' })];
    const selection = [
      { type: 'node' as const, id: 'a' },
      { type: 'node' as const, id: 'b' },
      { type: 'edge' as const, id: 'e1' },
    ];
    expect(selectedGroupId(nodes, selection)).toBe('g1');
  });
});
