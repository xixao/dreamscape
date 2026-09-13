import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createInitialDiagramState, type DiagramEdge, type DiagramNode, type DiagramState } from '@/lib/diagram/store';
import { DiagramLayer, type DiagramFrameBox, type DiagramTool } from './diagram-layer';

function node(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: 'node000001',
    kind: 'rect',
    x: 100,
    y: 100,
    width: 120,
    height: 60,
    text: 'Hello',
    color: 'neutral',
    ...overrides,
  };
}

function edge(overrides: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    id: 'edge0000001',
    source: { nodeId: 'a', side: 'right' },
    target: { nodeId: 'b', side: 'left' },
    kind: 'step',
    arrow: 'end',
    ...overrides,
  };
}

function stateWith(overrides: Partial<Pick<DiagramState, 'nodes' | 'edges' | 'selection'>> = {}): DiagramState {
  return { ...createInitialDiagramState(), ...overrides };
}

function renderLayer(overrides: Partial<ComponentProps<typeof DiagramLayer>> = {}) {
  const dispatch = vi.fn();
  const onToolConsumed = vi.fn();
  const props: ComponentProps<typeof DiagramLayer> = {
    diagram: createInitialDiagramState(),
    dispatch,
    frames: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    tool: { kind: 'pointer' },
    onToolConsumed,
    ...overrides,
  };
  const result = render(<DiagramLayer {...props} />);
  return { ...result, dispatch, onToolConsumed };
}

// Fires a window-level pointermove at (x, y) to establish hover state the
// same way a real cursor motion would - the layer tracks hover globally
// (see diagram-layer.tsx's own doc comment on why), not through per-shape
// listeners.
function hoverAt(x: number, y: number): void {
  fireEvent(window, new PointerEvent('pointermove', { clientX: x, clientY: y }));
}

describe('DiagramLayer rendering', () => {
  it('renders every node kind with its text', () => {
    const kinds: DiagramNode['kind'][] = ['rect', 'rounded', 'decision', 'terminal', 'text', 'note'];
    const nodes = kinds.map((kind, index) => node({ id: `n${index}`, kind, text: kind, x: index * 200, y: 0 }));
    renderLayer({ diagram: stateWith({ nodes }) });

    for (const kind of kinds) {
      expect(screen.getByText(kind)).toBeInTheDocument();
    }
  });

  it('renders an edge as a path connecting the two node handles', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    renderLayer({ diagram: stateWith({ nodes, edges: [edge()] }) });

    const hit = screen.getByTestId('diagram-edge-hit-edge0000001');
    // Leaves node a's right handle (100, 25) and arrives at node b's left
    // handle (300, 25).
    expect(hit.getAttribute('d')).toContain('M100,25');
    expect(hit.getAttribute('d')).toContain('300,25');
  });

  it('anchors a side-less edge toward the OTHER endpoint, not toward itself', () => {
    // Neither endpoint stores a side - the renderer must fall back to
    // wherever the far end actually is. a sits left of b: the path should
    // leave a's right handle and arrive at b's left handle, not both
    // resolving to "bottom" (the bug: the fallback always measured toward
    // its own box instead of the other endpoint's).
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    const noSideEdge = edge({ source: { nodeId: 'a' }, target: { nodeId: 'b' } });
    renderLayer({ diagram: stateWith({ nodes, edges: [noSideEdge] }) });

    const hit = screen.getByTestId('diagram-edge-hit-edge0000001');
    expect(hit.getAttribute('d')).toContain('M100,25');
    expect(hit.getAttribute('d')).toContain('300,25');
  });

  it('gives an edge a marker-end for "end", both markers for "both", and neither for "none"', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    const { rerender } = render(
      <DiagramLayer
        diagram={stateWith({ nodes, edges: [edge({ arrow: 'end' })] })}
        dispatch={vi.fn()}
        frames={[]}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        tool={{ kind: 'pointer' }}
        onToolConsumed={vi.fn()}
      />,
    );
    const visiblePath = () => document.querySelectorAll('[data-testid="diagram-edge-edge0000001"] path')[1] as SVGPathElement;
    expect(visiblePath().getAttribute('marker-end')).toContain('diagram-arrowhead');
    expect(visiblePath().getAttribute('marker-start')).toBeNull();

    rerender(
      <DiagramLayer
        diagram={stateWith({ nodes, edges: [edge({ arrow: 'both' })] })}
        dispatch={vi.fn()}
        frames={[]}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        tool={{ kind: 'pointer' }}
        onToolConsumed={vi.fn()}
      />,
    );
    expect(visiblePath().getAttribute('marker-end')).toContain('diagram-arrowhead');
    expect(visiblePath().getAttribute('marker-start')).toContain('diagram-arrowhead');

    rerender(
      <DiagramLayer
        diagram={stateWith({ nodes, edges: [edge({ arrow: 'none' })] })}
        dispatch={vi.fn()}
        frames={[]}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        tool={{ kind: 'pointer' }}
        onToolConsumed={vi.fn()}
      />,
    );
    expect(visiblePath().getAttribute('marker-end')).toBeNull();
  });

  it('renders a label chip at the path midpoint only when the edge has a label', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    const { rerender } = render(
      <DiagramLayer
        diagram={stateWith({ nodes, edges: [edge({ label: 'yes' })] })}
        dispatch={vi.fn()}
        frames={[]}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        tool={{ kind: 'pointer' }}
        onToolConsumed={vi.fn()}
      />,
    );
    expect(screen.getByText('yes')).toBeInTheDocument();

    rerender(
      <DiagramLayer
        diagram={stateWith({ nodes, edges: [edge({ label: undefined })] })}
        dispatch={vi.fn()}
        frames={[]}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        tool={{ kind: 'pointer' }}
        onToolConsumed={vi.fn()}
      />,
    );
    expect(screen.queryByText('yes')).not.toBeInTheDocument();
  });

  it('does not render a hover handle until hovered', () => {
    renderLayer({ diagram: stateWith({ nodes: [node()] }) });
    const handle = screen.getByTestId('diagram-handle-node-node000001-right');
    expect(handle).toHaveStyle({ opacity: 0 });
  });

  it('shows hover handles on a node once the pointer moves over it', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    expect(screen.getByTestId('diagram-handle-node-node000001-right')).toHaveStyle({ opacity: 1 });
  });

  it('shows hover handles on a frame once the pointer moves over it', () => {
    const frames: DiagramFrameBox[] = [{ id: 'screen1', x: 0, y: 0, width: 400, height: 800 }];
    renderLayer({ frames });
    hoverAt(200, 400);
    expect(screen.getByTestId('diagram-handle-frame-screen1-right')).toHaveStyle({ opacity: 1 });
  });
});

describe('DiagramLayer selection', () => {
  it('selects a node on click', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node()] }) });
    fireEvent.pointerDown(screen.getByTestId('diagram-node-node000001'), { pointerId: 1, clientX: 150, clientY: 130 });

    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'node000001' }] });
  });

  it('adds to the selection with shift+click', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes, selection: [{ type: 'node', id: 'a' }] }) });

    fireEvent.pointerDown(screen.getByTestId('diagram-node-b'), { pointerId: 1, clientX: 450, clientY: 130, shiftKey: true });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'select',
      selection: [
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
      ],
    });
  });

  it('shift+clicking an already-selected node removes it from the selection', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes,
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
        ],
      }),
    });

    fireEvent.pointerDown(screen.getByTestId('diagram-node-b'), { pointerId: 1, clientX: 450, clientY: 130, shiftKey: true });

    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'a' }] });
  });

  it('selects an edge on click', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes, edges: [edge()] }) });

    fireEvent.pointerDown(screen.getByTestId('diagram-edge-hit-edge0000001'), { pointerId: 1, clientX: 200, clientY: 25 });

    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'edge', id: 'edge0000001' }] });
  });
});

describe('DiagramLayer drag', () => {
  it('moves the selected node by the pointer delta, dispatched once on release', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 170, clientY: 135 });
    dispatch.mockClear();
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 170, clientY: 135 });

    expect(dispatch).toHaveBeenCalledWith({ type: 'move', ids: ['node000001'], dx: 20, dy: 5 });
  });

  it('does not dispatch a move when the pointer never actually moved', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130 });
    dispatch.mockClear();
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 150, clientY: 130 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'move' }));
  });

  it('dragging one member of a multi-selection moves every selected node', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes,
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
        ],
      }),
    });
    const el = screen.getByTestId('diagram-node-a');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 160, clientY: 130 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 160, clientY: 130 });

    expect(dispatch).toHaveBeenCalledWith({ type: 'move', ids: ['a', 'b'], dx: 10, dy: 0 });
  });

  it('divides the screen-pixel delta by the current zoom', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
      viewport: { x: 0, y: 0, zoom: 2 },
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 0 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 40, clientY: 0 });

    expect(dispatch).toHaveBeenCalledWith({ type: 'move', ids: ['node000001'], dx: 20, dy: 0 });
  });
});

describe('DiagramLayer resize', () => {
  it('resizes from the bottom-right handle', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50 })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    const handle = screen.getByTestId('diagram-resize-node000001-se');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140, clientY: 90 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 140, clientY: 90 });

    expect(dispatch).toHaveBeenCalledWith({ type: 'resize', id: 'node000001', width: 140, height: 90 });
  });

  it('resizing from the top-left handle repositions the node in the SAME dispatch (one history entry, not a resize plus a move)', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 100, y: 100, width: 100, height: 50 })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    const handle = screen.getByTestId('diagram-resize-node000001-nw');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 80, clientY: 90 });
    dispatch.mockClear();
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 80, clientY: 90 });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'resize', id: 'node000001', width: 120, height: 60, x: 80, y: 90 });
  });

  it('does not report x/y at all when a corner resize does not move the box (bottom-right)', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50 })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    const handle = screen.getByTestId('diagram-resize-node000001-se');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140, clientY: 90 });
    dispatch.mockClear();
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 140, clientY: 90 });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'resize', id: 'node000001', width: 140, height: 90 });
  });
});

describe('DiagramLayer connecting', () => {
  it('drags from a node handle to another node to create a connector', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes }) });

    hoverAt(50, 25); // over node a, to reveal its handles
    const handle = screen.getByTestId('diagram-handle-node-a-right');
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 320, clientY: 25 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 320, clientY: 25 });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'connect',
      edge: expect.objectContaining({
        source: { nodeId: 'a', side: 'right' },
        target: { nodeId: 'b', side: 'left' },
        kind: 'step',
        arrow: 'end',
      }),
    });
  });

  it('drags from a node handle to a frame to create a connector', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 })];
    const frames: DiagramFrameBox[] = [{ id: 'screen1', x: 300, y: 0, width: 400, height: 800 }];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes }), frames });

    hoverAt(50, 25);
    const handle = screen.getByTestId('diagram-handle-node-a-right');
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 320, clientY: 400 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 320, clientY: 400 });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'connect',
      edge: expect.objectContaining({
        source: { nodeId: 'a', side: 'right' },
        target: { screenId: 'screen1', side: 'left' },
      }),
    });
  });

  it('drops with nothing underneath and creates no connector', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes }) });

    hoverAt(50, 25);
    const handle = screen.getByTestId('diagram-handle-node-a-right');
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 900, clientY: 900 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 900, clientY: 900 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'connect' }));
  });
});

describe('DiagramLayer inline text editing', () => {
  it('double-clicking a shape opens a text input with its current text', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ text: 'Login' })] }) });
    fireEvent.doubleClick(screen.getByTestId('diagram-node-node000001'));

    expect(screen.getByTestId('diagram-text-input-node000001')).toHaveValue('Login');
  });

  it('commits on Enter', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node({ text: 'Login' })] }) });
    fireEvent.doubleClick(screen.getByTestId('diagram-node-node000001'));
    const input = screen.getByTestId('diagram-text-input-node000001');

    fireEvent.change(input, { target: { value: 'Sign in' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'setText', id: 'node000001', text: 'Sign in' });
    expect(screen.queryByTestId('diagram-text-input-node000001')).not.toBeInTheDocument();
  });

  it('breaks a line on Shift+Enter instead of committing', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node({ text: 'Login' })] }) });
    fireEvent.doubleClick(screen.getByTestId('diagram-node-node000001'));
    const input = screen.getByTestId('diagram-text-input-node000001');

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setText' }));
    expect(screen.getByTestId('diagram-text-input-node000001')).toBeInTheDocument();
  });

  it('cancels on Escape without dispatching', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node({ text: 'Login' })] }) });
    fireEvent.doubleClick(screen.getByTestId('diagram-node-node000001'));
    const input = screen.getByTestId('diagram-text-input-node000001');

    fireEvent.change(input, { target: { value: 'Changed my mind' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setText' }));
    expect(screen.queryByTestId('diagram-text-input-node000001')).not.toBeInTheDocument();
  });

  it('commits on blur', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node({ text: 'Login' })] }) });
    fireEvent.doubleClick(screen.getByTestId('diagram-node-node000001'));
    const input = screen.getByTestId('diagram-text-input-node000001');

    fireEvent.change(input, { target: { value: 'Blurred' } });
    fireEvent.blur(input);

    expect(dispatch).toHaveBeenCalledWith({ type: 'setText', id: 'node000001', text: 'Blurred' });
  });

  it('caps input at 500 characters', () => {
    renderLayer({ diagram: stateWith({ nodes: [node()] }) });
    fireEvent.doubleClick(screen.getByTestId('diagram-node-node000001'));

    expect(screen.getByTestId('diagram-text-input-node000001')).toHaveAttribute('maxLength', '500');
  });
});

describe('DiagramLayer placement', () => {
  const tool: DiagramTool = { kind: 'shape', shape: 'rect' };

  it('places a default-sized shape on a plain click', () => {
    const { dispatch, onToolConsumed } = renderLayer({ tool });
    const surface = screen.getByTestId('diagram-placement-surface');

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 200, clientY: 100 });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'add',
      node: expect.objectContaining({ kind: 'rect', width: 160, height: 80, color: 'neutral', text: '' }),
    });
    // Centered on the click point and snapped to the grid.
    const call = dispatch.mock.calls.find((c) => c[0].type === 'add');
    expect(call![0].node.x).toBe(120);
    expect(call![0].node.y).toBe(64);
    expect(onToolConsumed).toHaveBeenCalled();
  });

  it('places a shape sized to the drag rectangle', () => {
    const { dispatch, onToolConsumed } = renderLayer({ tool });
    const surface = screen.getByTestId('diagram-placement-surface');

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 200, clientY: 80 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 200, clientY: 80 });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'add',
      node: expect.objectContaining({ x: 0, y: 0, width: 200, height: 80 }),
    });
    expect(onToolConsumed).toHaveBeenCalled();
  });

  it('abandons an in-progress placement drag when the tool changes away from shape', () => {
    const { dispatch, rerender } = renderLayer({ tool });
    const surface = screen.getByTestId('diagram-placement-surface');
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 0, clientY: 0 });

    rerender(
      <DiagramLayer
        diagram={createInitialDiagramState()}
        dispatch={dispatch}
        frames={[]}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        tool={{ kind: 'pointer' }}
        onToolConsumed={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('diagram-placement-surface')).not.toBeInTheDocument();
  });
});
