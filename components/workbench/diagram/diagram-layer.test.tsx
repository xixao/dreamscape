import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('DiagramLayer live connector redraw during drag/resize', () => {
  it('redraws a connected edge on every pointer move while dragging, before the store is written', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes, edges: [edge()], selection: [{ type: 'node', id: 'a' }] }),
    });
    const hit = screen.getByTestId('diagram-edge-hit-edge0000001');
    const before = hit.getAttribute('d');

    const el = screen.getByTestId('diagram-node-a');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 25 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 100, clientY: 75 });

    expect(hit.getAttribute('d')).not.toBe(before);
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'move' }));

    fireEvent.pointerUp(el, { pointerId: 1, clientX: 100, clientY: 75 });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'move' }));
  });

  it('redraws a connected edge on every pointer move while resizing from a corner, before the store is written', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes, edges: [edge()], selection: [{ type: 'node', id: 'a' }] }),
    });
    const hit = screen.getByTestId('diagram-edge-hit-edge0000001');
    const before = hit.getAttribute('d');

    const handle = screen.getByTestId('diagram-resize-a-se');
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 160, clientY: 90 });

    expect(hit.getAttribute('d')).not.toBe(before);
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'resize' }));

    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 160, clientY: 90 });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'resize' }));
  });
});

describe('DiagramLayer option-drag duplicate', () => {
  it('dispatches a zero-offset duplicate of the selection when a drag starts on a selected shape with Alt held', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'duplicate',
        pairs: [{ sourceId: 'node000001', newId: expect.any(String) }],
        offset: { x: 0, y: 0 },
      }),
    );
  });

  it('drags the copy, not the original, on subsequent pointer moves', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });
    const newId = (dispatch.mock.calls[0][0] as { pairs: { newId: string }[] }).pairs[0].newId;
    dispatch.mockClear();

    fireEvent.pointerMove(el, { pointerId: 1, clientX: 170, clientY: 135 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 170, clientY: 135 });

    expect(dispatch).toHaveBeenCalledWith({ type: 'move', ids: [newId], dx: 20, dy: 5 });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ ids: ['node000001'] }));
  });

  it('duplicates the whole multi-selection with zero offset', () => {
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

    fireEvent.pointerDown(screen.getByTestId('diagram-node-a'), { pointerId: 1, clientX: 150, clientY: 130, altKey: true });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'duplicate',
        pairs: [
          { sourceId: 'a', newId: expect.any(String) },
          { sourceId: 'b', newId: expect.any(String) },
        ],
        offset: { x: 0, y: 0 },
      }),
    );
  });

  it('duplicates a connector whose both endpoints are in the dragged selection', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes,
        edges: [edge({ id: 'e1', source: { nodeId: 'a', side: 'right' }, target: { nodeId: 'b', side: 'left' } })],
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
        ],
      }),
    });

    fireEvent.pointerDown(screen.getByTestId('diagram-node-a'), { pointerId: 1, clientX: 150, clientY: 130, altKey: true });

    const call = dispatch.mock.calls[0][0] as { edgePairs: { sourceId: string; newId: string }[] };
    expect(call.edgePairs).toEqual([{ sourceId: 'e1', newId: expect.any(String) }]);
  });

  it('does not duplicate a connector whose other endpoint is not in the dragged selection', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes,
        edges: [edge({ id: 'e1', source: { nodeId: 'a', side: 'right' }, target: { nodeId: 'b', side: 'left' } })],
        selection: [{ type: 'node', id: 'a' }],
      }),
    });

    fireEvent.pointerDown(screen.getByTestId('diagram-node-a'), { pointerId: 1, clientX: 150, clientY: 130, altKey: true });

    const call = dispatch.mock.calls[0][0] as { edgePairs: { sourceId: string; newId: string }[] };
    expect(call.edgePairs).toEqual([]);
  });

  it('ignores Alt on a shape that is not already selected (plain select+drag instead)', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node()] }) });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'duplicate' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'node000001' }] });
  });
});

describe('DiagramLayer option-drag cursor affordance', () => {
  it('adds a cursor-copy class to a hovered, selected shape while Alt is held, removed on keyup', () => {
    renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50 })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    hoverAt(50, 25);

    fireEvent.keyDown(window, { key: 'Alt' });
    expect(screen.getByTestId('diagram-node-node000001')).toHaveClass('cursor-copy');

    fireEvent.keyUp(window, { key: 'Alt' });
    expect(screen.getByTestId('diagram-node-node000001')).not.toHaveClass('cursor-copy');
  });

  it('does not add cursor-copy to a hovered shape that is not selected', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    fireEvent.keyDown(window, { key: 'Alt' });
    expect(screen.getByTestId('diagram-node-node000001')).not.toHaveClass('cursor-copy');
  });

  it('clears the held state on window blur, so it never gets stuck on', () => {
    renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50 })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    hoverAt(50, 25);
    fireEvent.keyDown(window, { key: 'Alt' });
    fireEvent(window, new Event('blur'));
    expect(screen.getByTestId('diagram-node-node000001')).not.toHaveClass('cursor-copy');
  });

  it('removes its keydown/keyup listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderLayer();
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
    removeSpy.mockRestore();
  });
});

describe('DiagramLayer quick-add circles', () => {
  it('are hidden until the shape is hovered', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    expect(screen.queryByTestId('diagram-quick-add-node000001-right')).not.toBeInTheDocument();
  });

  it('show all four sides, positioned just outside the box, once hovered', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);

    for (const side of ['top', 'right', 'bottom', 'left']) {
      const circle = screen.getByTestId(`diagram-quick-add-node000001-${side}`);
      expect(circle).toHaveAttribute('aria-label', `Add a shape to the ${side}`);
    }
  });

  it('clicking a side dispatches quickAdd for that side and opens the new shape\'s text editor', () => {
    const source = node({ x: 0, y: 0, width: 100, height: 50 });
    const { dispatch, rerender } = renderLayer({ diagram: stateWith({ nodes: [source] }) });
    hoverAt(50, 25);

    fireEvent.click(screen.getByTestId('diagram-quick-add-node000001-right'));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quickAdd', sourceId: 'node000001', side: 'right' }),
    );
    const call = dispatch.mock.calls[0][0] as { newNodeId: string };

    // The mocked dispatch does not actually create the new node - reflect
    // what the real reducer would have done (lib/diagram/store.test.ts
    // covers that reducer behaviour directly) so the editor, real LOCAL
    // component state unaffected by the mock, can be observed opening for
    // it once the new node is actually present in `diagram`.
    const newNode: DiagramNode = { ...source, id: call.newNodeId, x: 220, text: '' };
    rerender(
      <DiagramLayer
        diagram={stateWith({ nodes: [source, newNode] })}
        dispatch={dispatch}
        frames={[]}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        tool={{ kind: 'pointer' }}
        onToolConsumed={vi.fn()}
      />,
    );

    expect(screen.getByTestId(`diagram-text-input-${call.newNodeId}`)).toBeInTheDocument();
  });

  it('every side dispatches its own side', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    for (const side of ['top', 'right', 'bottom', 'left']) {
      hoverAt(50, 25);
      fireEvent.click(screen.getByTestId(`diagram-quick-add-node000001-${side}`));
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'quickAdd', side }));
    }
  });

  it('hide when the pointer leaves the shape and its circles entirely', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();

    hoverAt(900, 900);
    expect(screen.queryByTestId('diagram-quick-add-node000001-right')).not.toBeInTheDocument();
  });

  it('stay visible when the pointer moves from the shape onto one of its own circles', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    // The right circle sits a little to the right of the box's own right
    // edge (100, 25) - just past it, not still inside the shape.
    hoverAt(114, 25);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();
  });

  it('hide during a drag', () => {
    renderLayer({
      diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    hoverAt(50, 25);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('diagram-node-node000001'), { pointerId: 1, clientX: 50, clientY: 25 });
    fireEvent.pointerMove(screen.getByTestId('diagram-node-node000001'), { pointerId: 1, clientX: 70, clientY: 30 });

    expect(screen.queryByTestId('diagram-quick-add-node000001-right')).not.toBeInTheDocument();
  });

  it('hide on Escape', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('diagram-quick-add-node000001-right')).not.toBeInTheDocument();
  });
});

describe('DiagramLayer right-click never also acts as a left-click gesture (review finding 2)', () => {
  it('a right-button pointerdown on a shape does not start a drag or change selection', () => {
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

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, button: 2 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 190, clientY: 130, button: 2 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 190, clientY: 130, button: 2 });
    fireEvent.contextMenu(el);

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'move' }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'select' }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'duplicate' }));
  });

  it('a real right-click sequence on an edge inside a multi-selection leaves the selection alone', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes,
        edges: [edge()],
        selection: [
          { type: 'node', id: 'a' },
          { type: 'edge', id: 'edge0000001' },
        ],
      }),
    });
    const hit = screen.getByTestId('diagram-edge-hit-edge0000001');

    fireEvent.pointerDown(hit, { pointerId: 1, clientX: 200, clientY: 25, button: 2 });
    fireEvent.contextMenu(hit);

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'select' }));
  });

  it('a right-button pointerdown on a resize handle does not resize', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50 })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    const handle = screen.getByTestId('diagram-resize-node000001-se');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 50, button: 2 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140, clientY: 90, button: 2 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 140, clientY: 90, button: 2 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'resize' }));
  });

  it('a right-button pointerdown on a connect handle does not start a connector', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes }) });
    hoverAt(50, 25);
    const handle = screen.getByTestId('diagram-handle-node-a-right');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 25, button: 2 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 320, clientY: 25, button: 2 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 320, clientY: 25, button: 2 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'connect' }));
  });

  it('a right-button pointerdown on the placement surface does not place a shape', () => {
    const { dispatch } = renderLayer({ tool: { kind: 'shape', shape: 'rect' } });
    const surface = screen.getByTestId('diagram-placement-surface');

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 200, clientY: 100, button: 2 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 200, clientY: 100, button: 2 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'add' }));
  });
});

describe('DiagramLayer overlapping shapes (review finding 4)', () => {
  it('hover targets the top-most (last-rendered) of two overlapping shapes', () => {
    const nodes = [
      node({ id: 'bottom', x: 0, y: 0, width: 100, height: 50 }),
      node({ id: 'top', x: 50, y: 0, width: 100, height: 50 }),
    ];
    renderLayer({ diagram: stateWith({ nodes }) });

    hoverAt(75, 25);

    expect(screen.getByTestId('diagram-handle-node-top-right')).toHaveStyle({ opacity: 1 });
    expect(screen.getByTestId('diagram-handle-node-bottom-right')).toHaveStyle({ opacity: 0 });
  });

  it('a connector dropped on the overlap attaches to the top-most (last-rendered) shape', () => {
    const nodes = [
      node({ id: 'source', x: -200, y: 0, width: 100, height: 50 }),
      node({ id: 'bottom', x: 0, y: 0, width: 100, height: 50 }),
      node({ id: 'top', x: 50, y: 0, width: 100, height: 50 }),
    ];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes }) });
    hoverAt(-150, 25);
    const handle = screen.getByTestId('diagram-handle-node-source-right');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: -100, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 75, clientY: 25 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 75, clientY: 25 });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'connect',
        edge: expect.objectContaining({ target: { nodeId: 'top', side: 'left' } }),
      }),
    );
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

describe('DiagramLayer context menu (shape)', () => {
  it('selects an unselected shape when right-clicked', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node()] }) });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'node000001' }] });
  });

  it('leaves an existing multi-selection alone when the right-clicked shape is already part of it', () => {
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
    fireEvent.contextMenu(screen.getByTestId('diagram-node-a'));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'select' }));
  });

  it('shows every item', async () => {
    renderLayer({ diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }) });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));

    for (const label of [
      'Change shape',
      'Colour',
      'Align',
      'Edit text',
      'Duplicate',
      'Bring to front',
      'Send to back',
      'Delete',
    ]) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  it('"Change shape" checks the current kind and dispatches setKind on another', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node({ kind: 'decision' })], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Change shape' }));

    expect(screen.getByRole('menuitemradio', { name: 'Decision' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Rectangle' })).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Rectangle' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'setKind', id: 'node000001', kind: 'rect' });
  });

  it('"Colour" checks the current colour and dispatches setColor on another', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node({ color: 'blue' })], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Colour' }));

    expect(screen.getByRole('menuitemradio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Green' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'setColor', id: 'node000001', color: 'green' });
  });

  it('"Edit text" opens the same inline editor as a double-click', async () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ text: 'Login' })], selection: [{ type: 'node', id: 'node000001' }] }) });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit text' }));

    expect(screen.getByTestId('diagram-text-input-node000001')).toHaveValue('Login');
  });

  it('"Duplicate" duplicates the whole current selection, edges between duplicated shapes included', async () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes,
        edges: [edge({ id: 'e1', source: { nodeId: 'a', side: 'right' }, target: { nodeId: 'b', side: 'left' } })],
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
        ],
      }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-a'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'duplicate',
        pairs: [
          { sourceId: 'a', newId: expect.any(String) },
          { sourceId: 'b', newId: expect.any(String) },
        ],
        edgePairs: [{ sourceId: 'e1', newId: expect.any(String) }],
      }),
    );
  });

  it('"Bring to front" and "Send to back" dispatch reorder for the selection', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Bring to front' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'reorder', ids: ['node000001'], to: 'front' });

    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Send to back' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'reorder', ids: ['node000001'], to: 'back' });
  });

  it('"Delete" dispatches delete for the whole current selection', async () => {
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
    fireEvent.contextMenu(screen.getByTestId('diagram-node-a'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'delete', ids: ['a', 'b'] });
  });

  it('Shift+F10 opens the same menu for a selected shape', async () => {
    renderLayer({ diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }) });
    fireEvent.keyDown(window, { key: 'F10', shiftKey: true });
    expect(await screen.findByRole('menuitem', { name: 'Edit text' })).toBeInTheDocument();
  });

  it('the Menu key opens the same menu for a selected shape', async () => {
    renderLayer({ diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }) });
    fireEvent.keyDown(window, { key: 'ContextMenu' });
    expect(await screen.findByRole('menuitem', { name: 'Edit text' })).toBeInTheDocument();
  });

  it('does nothing when nothing is selected (no shape to open a menu for)', () => {
    renderLayer({ diagram: stateWith({ nodes: [node()] }) });
    fireEvent.keyDown(window, { key: 'F10', shiftKey: true });
    expect(screen.queryByRole('menuitem', { name: 'Edit text' })).not.toBeInTheDocument();
  });
});

describe('DiagramLayer context menu (Align submenu)', () => {
  it('disables every align item, and both distribute items, with only one shape selected', async () => {
    renderLayer({ diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }) });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Align' }));

    expect(screen.getByRole('menuitem', { name: 'Left' })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: 'Distribute horizontally' })).toHaveAttribute('data-disabled');
  });

  it('enables align (not distribute) with two shapes selected, and dispatches align for the whole selection', async () => {
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
    fireEvent.contextMenu(screen.getByTestId('diagram-node-a'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Align' }));

    expect(screen.getByRole('menuitem', { name: 'Left' })).not.toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: 'Distribute horizontally' })).toHaveAttribute('data-disabled');

    await userEvent.click(screen.getByRole('menuitem', { name: 'Left' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'align', ids: ['a', 'b'], mode: 'left' });
  });

  it('every align mode dispatches its own mode', async () => {
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
    const cases: [string, string][] = [
      ['Left', 'left'],
      ['Center', 'centerX'],
      ['Right', 'right'],
      ['Top', 'top'],
      ['Middle', 'centerY'],
      ['Bottom', 'bottom'],
    ];
    for (const [label, mode] of cases) {
      fireEvent.contextMenu(screen.getByTestId('diagram-node-a'));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Align' }));
      await userEvent.click(screen.getByRole('menuitem', { name: label }));
      expect(dispatch).toHaveBeenCalledWith({ type: 'align', ids: ['a', 'b'], mode });
    }
  });

  it('enables distribute with three shapes selected, and dispatches distribute for the whole selection', async () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 }), node({ id: 'c', x: 800 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes,
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
          { type: 'node', id: 'c' },
        ],
      }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-a'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Align' }));
    expect(screen.getByRole('menuitem', { name: 'Distribute horizontally' })).not.toHaveAttribute('data-disabled');

    await userEvent.click(screen.getByRole('menuitem', { name: 'Distribute horizontally' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'distribute', ids: ['a', 'b', 'c'], axis: 'horizontal' });

    fireEvent.contextMenu(screen.getByTestId('diagram-node-a'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Align' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Distribute vertically' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'distribute', ids: ['a', 'b', 'c'], axis: 'vertical' });
  });
});

describe('DiagramLayer context menu (connector)', () => {
  const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];

  it('selects an unselected connector when right-clicked, and shows every item', async () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes, edges: [edge()] }) });
    fireEvent.contextMenu(screen.getByTestId('diagram-edge-hit-edge0000001'));

    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'edge', id: 'edge0000001' }] });
    for (const label of ['Connector', 'Arrowheads', 'Edit label', 'Delete']) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  it('"Connector" checks the current kind and dispatches setKind on another', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes, edges: [edge({ kind: 'step' })], selection: [{ type: 'edge', id: 'edge0000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-edge-hit-edge0000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Connector' }));

    expect(screen.getByRole('menuitemradio', { name: 'Step' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Curve' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'setKind', id: 'edge0000001', kind: 'curve' });
  });

  it('"Arrowheads" checks the current arrow and dispatches setArrow on another', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes, edges: [edge({ arrow: 'end' })], selection: [{ type: 'edge', id: 'edge0000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-edge-hit-edge0000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Arrowheads' }));

    expect(screen.getByRole('menuitemradio', { name: 'End' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Both' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'setArrow', id: 'edge0000001', arrow: 'both' });
  });

  it('"Edit label" opens an inline editor with the current label', async () => {
    renderLayer({
      diagram: stateWith({ nodes, edges: [edge({ label: 'yes' })], selection: [{ type: 'edge', id: 'edge0000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-edge-hit-edge0000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit label' }));

    expect(screen.getByTestId('diagram-text-input-edge0000001')).toHaveValue('yes');
  });

  it('committing the inline label editor on Enter dispatches setText', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes, edges: [edge()], selection: [{ type: 'edge', id: 'edge0000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-edge-hit-edge0000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit label' }));
    const input = screen.getByTestId('diagram-text-input-edge0000001');

    fireEvent.change(input, { target: { value: 'yes' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledWith({ type: 'setText', id: 'edge0000001', text: 'yes' });
    expect(screen.queryByTestId('diagram-text-input-edge0000001')).not.toBeInTheDocument();
  });

  it('"Delete" dispatches delete', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes, edges: [edge()], selection: [{ type: 'edge', id: 'edge0000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-edge-hit-edge0000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'delete', ids: ['edge0000001'] });
  });

  it('Shift+F10 opens the same menu for a selected connector', async () => {
    renderLayer({ diagram: stateWith({ nodes, edges: [edge()], selection: [{ type: 'edge', id: 'edge0000001' }] }) });
    fireEvent.keyDown(window, { key: 'F10', shiftKey: true });
    expect(await screen.findByRole('menuitem', { name: 'Edit label' })).toBeInTheDocument();
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
