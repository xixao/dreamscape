import { useEffect, useReducer, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createInitialDiagramState,
  diagramReducer,
  type DiagramAction,
  type DiagramEdge,
  type DiagramNode,
  type DiagramState,
} from '@/lib/diagram/store';
import { DiagramLayer, POINTER_TOOL, type DiagramFrameBox, type DiagramTool } from './diagram-layer';

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

// Wires DiagramLayer to the REAL reducer (review finding 1/10/12: several
// findings call out that every existing test mocks `dispatch`, so "the
// original is untouched" or "one undo removes the copies" was only ever
// inferred from what got dispatched, never actually verified against the
// store). `dispatchRef`, when given, exposes the reducer's own dispatch so
// a test can also fire an out-of-gesture action (e.g. `undo`) directly.
function RealReducerHarness({
  initial,
  dispatchRef,
  tool = POINTER_TOOL,
  frames = [],
}: {
  initial: DiagramState;
  dispatchRef?: { current: (action: DiagramAction) => void };
  tool?: DiagramTool;
  frames?: DiagramFrameBox[];
}) {
  const [diagram, dispatch] = useReducer(diagramReducer, initial);
  // Not a real React ref (just a plain mutable object the test reads from
  // outside render) - assigned in an effect regardless, same discipline a
  // real one would need, and it keeps the react-hooks/refs rule happy.
  useEffect(() => {
    if (dispatchRef) dispatchRef.current = dispatch;
  }, [dispatchRef, dispatch]);
  return (
    <DiagramLayer
      diagram={diagram}
      dispatch={dispatch}
      frames={frames}
      viewport={{ x: 0, y: 0, zoom: 1 }}
      tool={tool}
      onToolConsumed={() => {}}
    />
  );
}

// Fires a window-level pointermove at (x, y) to establish hover state the
// same way a real cursor motion would - the layer tracks hover globally
// (see diagram-layer.tsx's own doc comment on why), not through per-shape
// listeners.
function hoverAt(x: number, y: number): void {
  fireEvent(window, new PointerEvent('pointermove', { clientX: x, clientY: y }));
}

// Tallies a vi.spyOn(window, 'addEventListener' | 'removeEventListener')
// spy's calls by event name, so a test can assert add/remove counts match
// per event rather than just "was called at all" (review finding 10's own
// test-gap list: the latter passes even when one of several same-named
// listeners leaks).
function countByEventName(spy: { mock: { calls: unknown[][] } }): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const call of spy.mock.calls) {
    const name = call[0] as string;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
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

  // Spec section 9: on-screen text honours a shape's own optional text
  // size/font/color, defaulting to medium/sans/default (today's fixed 24px
  // white sans) when absent.
  it("defaults a shape's text to medium/sans/white when no text style is set", () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ text: 'Hi' })] }) });
    expect(screen.getByText('Hi')).toHaveClass('text-[24px]', 'font-sans', 'text-white');
  });

  it("renders a shape's own text size, font and color", () => {
    renderLayer({
      diagram: stateWith({ nodes: [node({ text: 'Hi', textSize: 'large', textFont: 'mono', textColor: 'blue' })] }),
    });
    const text = screen.getByText('Hi');
    expect(text).toHaveClass('text-[40px]', 'font-mono', 'text-blue-400');
    expect(text).not.toHaveClass('text-[24px]', 'font-sans', 'text-white');
  });

  it("renders the inline text editor with the shape's own text size, font and color", () => {
    renderLayer({
      diagram: stateWith({ nodes: [node({ text: 'Hi', textSize: 'small', textFont: 'serif', textColor: 'black' })] }),
    });
    fireEvent.doubleClick(screen.getByTestId('diagram-node-node000001'));
    expect(screen.getByTestId('diagram-text-input-node000001')).toHaveClass('text-[16px]', 'font-serif', 'text-black');
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
  // Review finding 10 (Matt's nudge rule): move no longer snaps on its own
  // (lib/diagram/store.ts), so a drag now snaps its own pointer delta
  // BEFORE dispatching, to land on the grid the same way it always
  // visually has. Every delta below is chosen as an exact multiple of 8 so
  // snapping is a deliberate no-op and the dispatched value is unambiguous
  // (an arbitrary delta like 20 would itself round up to 24 - see
  // lib/diagram/geometry.ts's snapToGrid, plain JS round-half-up).
  it('moves the selected node by the snapped pointer delta, dispatched once on release', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 166, clientY: 138 });
    dispatch.mockClear();
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 166, clientY: 138 });

    expect(dispatch).toHaveBeenCalledWith({ type: 'move', ids: ['node000001'], dx: 16, dy: 8 });
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

  it('does not dispatch a move when the raw delta snaps down to zero', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130 });
    // A 2px jiggle snaps to 0 on both axes - not a real drag.
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 152, clientY: 131 });
    dispatch.mockClear();
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 152, clientY: 131 });

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
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 158, clientY: 130 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 158, clientY: 130 });

    expect(dispatch).toHaveBeenCalledWith({ type: 'move', ids: ['a', 'b'], dx: 8, dy: 0 });
  });

  it('divides the screen-pixel delta by the current zoom before snapping', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
      viewport: { x: 0, y: 0, zoom: 2 },
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 48, clientY: 0 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 48, clientY: 0 });

    expect(dispatch).toHaveBeenCalledWith({ type: 'move', ids: ['node000001'], dx: 24, dy: 0 });
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

    // Re-review finding 21: the layer now snaps the raw pointer delta
    // (-20, -10) to the grid BEFORE computing the box, same as a drag
    // snaps its own delta - dx -20 -> -16, dy -10 -> -8, giving
    // width 100-(-16)=116, height 50-(-8)=58, x/y shifted by the same
    // snapped amount (100-16=84, 100-8... - x=box.x+box.width-width=
    // 100+100-116=84, y=box.y+box.height-height=100+50-58=92). Before this
    // fix the RAW delta was dispatched unsnapped (120, 60, 80, 90) and the
    // reducer silently re-snapped y alone to 88, which is exactly the
    // preview/landing mismatch finding 21 is about.
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'resize', id: 'node000001', width: 116, height: 58, x: 84, y: 92 });
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

  // Re-review finding 21 (also pins 26's "unpinned" off-grid resize case):
  // "what the preview shows is what lands" - proved here against the REAL
  // reducer, not the mocked dispatch every other test in this block uses,
  // so a re-snap anywhere between the live preview and the committed node
  // would actually be caught.
  it('lands the real reducer state exactly where its own live preview showed it, from an off-grid box', () => {
    const initial = stateWith({
      nodes: [node({ x: 101, y: 53, width: 100, height: 50 })],
      selection: [{ type: 'node', id: 'node000001' }],
    });
    render(<RealReducerHarness initial={initial} />);
    const handle = screen.getByTestId('diagram-resize-node000001-se');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 0 });
    // Raw delta (13, 7) - neither component a multiple of 8.
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 13, clientY: 7 });

    const previewRect = screen.getByTestId('diagram-node-node000001').querySelector('rect')!;
    const previewed = {
      x: previewRect.getAttribute('x'),
      y: previewRect.getAttribute('y'),
      width: previewRect.getAttribute('width'),
      height: previewRect.getAttribute('height'),
    };

    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 13, clientY: 7 });

    const landedRect = screen.getByTestId('diagram-node-node000001').querySelector('rect')!;
    expect({
      x: landedRect.getAttribute('x'),
      y: landedRect.getAttribute('y'),
      width: landedRect.getAttribute('width'),
      height: landedRect.getAttribute('height'),
    }).toEqual(previewed);
  });
});

describe('DiagramLayer Escape cancels an in-flight gesture, writing nothing (review finding 5)', () => {
  it('Escape mid-drag writes no move and releases the pointer; the following pointerup is a no-op', () => {
    const releaseSpy = vi.spyOn(Element.prototype, 'releasePointerCapture');
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 170, clientY: 135 });

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 170, clientY: 135 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'move' }));
    expect(releaseSpy).toHaveBeenCalledWith(1);
    releaseSpy.mockRestore();
  });

  it('Escape mid-resize writes no resize; the following pointerup is a no-op', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50 })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    const handle = screen.getByTestId('diagram-resize-node000001-se');
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140, clientY: 90 });

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 140, clientY: 90 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'resize' }));
  });

  it('pointercancel resets a drag without dispatching (a partial move is not committed)', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 170, clientY: 135 });

    fireEvent.pointerCancel(el, { pointerId: 1 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'move' }));
  });

  it('pointercancel resets a resize without dispatching', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50 })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    const handle = screen.getByTestId('diagram-resize-node000001-se');
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140, clientY: 90 });

    fireEvent.pointerCancel(handle, { pointerId: 1 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'resize' }));
  });

  // Re-review finding 26: drag and resize were pinned already; connect and
  // place were only probe-verified in the re-review, never given their own
  // test, despite going through the exact same cancelConnect/cancelPlace
  // path as the two above.
  it('Escape mid-connect writes no connector; the following pointerup is a no-op', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes }) });

    hoverAt(50, 25); // over node a, to reveal its handles
    const handle = screen.getByTestId('diagram-handle-node-a-right');
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 320, clientY: 25 });

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 320, clientY: 25 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'connect' }));
  });

  it('Escape mid-place writes no shape; the following pointerup is a no-op', () => {
    const { dispatch } = renderLayer({ tool: { kind: 'shape', shape: 'rect' } });
    const surface = screen.getByTestId('diagram-placement-surface');

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 260, clientY: 140 });

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 260, clientY: 140 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'add' }));
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

  it('redraws a no-side edge live too, using the far endpoint to pick a side each move (review item 12)', () => {
    // Same drag as above, but this edge stores no side on either endpoint,
    // exercising resolveEndpoint's no-side fallback (anchorForOther) instead
    // of the direct side lookup - endpointBox feeds that fallback the live
    // box for BOTH ends, so it needs its own coverage rather than assuming
    // the with-side test above already proves it.
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes,
        edges: [edge({ source: { nodeId: 'a' }, target: { nodeId: 'b' } })],
        selection: [{ type: 'node', id: 'a' }],
      }),
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

  it("moves the label chip live too, not just the connector's own path (review item 12)", () => {
    // pathFor returns labelX/labelY from the exact same resolved endpoints
    // as the path itself, but nothing previously pinned that the chip
    // actually re-renders at the new position mid-drag rather than only
    // once the gesture ends.
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes, edges: [edge({ label: 'flows to' })], selection: [{ type: 'node', id: 'a' }] }),
    });
    const edgeGroup = screen.getByTestId('diagram-edge-edge0000001');
    const chip = edgeGroup.querySelector('foreignObject')!;
    const beforeX = chip.getAttribute('x');
    const beforeY = chip.getAttribute('y');

    const el = screen.getByTestId('diagram-node-a');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 25 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 100, clientY: 75 });

    expect(edgeGroup.querySelector('foreignObject')!.getAttribute('x')).not.toBe(beforeX);
    expect(chip.getAttribute('y')).not.toBe(beforeY);
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'move' }));

    fireEvent.pointerUp(el, { pointerId: 1, clientX: 100, clientY: 75 });
  });
});

describe('DiagramLayer option-drag duplicate (review finding 1: a ghost until pointer up, one history step)', () => {
  it('dispatches no duplicate (or move) at pointer down - only sets up the drag', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    fireEvent.pointerDown(screen.getByTestId('diagram-node-node000001'), {
      pointerId: 1,
      clientX: 150,
      clientY: 130,
      altKey: true,
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'duplicate' }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'move' }));
  });

  it('dispatches no duplicate (or move) at pointer up when the pointer never actually moved (a plain Option-click)', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'duplicate' }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'move' }));
  });

  it('dispatches nothing on Option-right-click (pointerdown button 2, then contextmenu)', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true, button: 2 });
    fireEvent.contextMenu(el);
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'duplicate' }));
  });

  it('dispatches exactly one duplicate, with the snapped drag offset, at pointer up - on an already-selected shape, the ONLY dispatch of the whole gesture', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });
    // Already the sole selection, so pointerdown's own re-select of it is a
    // harmless no-op dispatch (unchanged, pre-existing behaviour for a
    // plain click too) - clear it so what follows is unambiguous.
    dispatch.mockClear();
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 270, clientY: 130, altKey: true });
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.pointerUp(el, { pointerId: 1, clientX: 270, clientY: 130, altKey: true });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'duplicate',
        pairs: [{ sourceId: 'node000001', newId: expect.any(String) }],
        offset: { x: 120, y: 0 },
      }),
    );
  });

  it('duplicates the whole multi-selection, offset included, in the one pointer-up dispatch', () => {
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

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 190, clientY: 130, altKey: true });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 190, clientY: 130, altKey: true });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'duplicate',
        pairs: [
          { sourceId: 'a', newId: expect.any(String) },
          { sourceId: 'b', newId: expect.any(String) },
        ],
        offset: { x: 40, y: 0 },
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
    const el = screen.getByTestId('diagram-node-a');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 190, clientY: 130, altKey: true });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 190, clientY: 130, altKey: true });

    const call = dispatch.mock.calls.find((c) => c[0].type === 'duplicate')![0] as {
      edgePairs: { sourceId: string; newId: string }[];
    };
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
    const el = screen.getByTestId('diagram-node-a');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 190, clientY: 130, altKey: true });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 190, clientY: 130, altKey: true });

    const call = dispatch.mock.calls.find((c) => c[0].type === 'duplicate')![0] as {
      edgePairs: { sourceId: string; newId: string }[];
    };
    expect(call.edgePairs).toEqual([]);
  });

  // Review nits 11/12: Figma option-drags any shape under the pointer,
  // selected or not - it selects first, same as a plain click would.
  it('on an unselected shape, selects it first, then drags a ghost of just it', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node()] }) });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'node000001' }] });
    dispatch.mockClear();

    fireEvent.pointerMove(el, { pointerId: 1, clientX: 190, clientY: 130, altKey: true });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 190, clientY: 130, altKey: true });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'duplicate', pairs: [{ sourceId: 'node000001', newId: expect.any(String) }] }),
    );
  });

  it('renders a ghost of the dragged shape, and leaves the real one in the document, while dragging', () => {
    renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50 })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0, altKey: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 0, altKey: true });

    expect(screen.getByTestId('diagram-node-node000001')).toBeInTheDocument();
    expect(screen.getByTestId('diagram-node-node000001').querySelector('rect')).toHaveAttribute('x', '0');
    expect(screen.getByTestId('diagram-option-drag-ghosts')).toBeInTheDocument();
  });

  // Re-review finding 23: the ghost previously drew only the shape body -
  // no text, no edge label - so the preview did not actually match what
  // the eventual copy would look like.
  it("draws the dragged shape's own text in the ghost too, matching the eventual copy", () => {
    renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50, text: 'Login' })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0, altKey: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 0, altKey: true });

    // Scoped to the ghost group specifically - the real shape being
    // dragged still shows its own "Login" text too, so a bare
    // screen.getByText('Login') would be ambiguous.
    expect(screen.getByTestId('diagram-option-drag-ghosts').textContent).toContain('Login');
  });

  // Spec section 9: the Option-drag ghost also honours the dragged shape's
  // own text size/font/color, not just its text.
  it("draws the ghost's text with the dragged shape's own text size, font and color", () => {
    renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50, text: 'Login', textSize: 'large', textFont: 'mono', textColor: 'red' })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
    const el = screen.getByTestId('diagram-node-node000001');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0, altKey: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 0, altKey: true });

    const ghostText = screen.getByTestId('diagram-option-drag-ghosts').querySelector('foreignObject div')!;
    expect(ghostText).toHaveClass('text-[40px]', 'font-mono', 'text-red-400');
  });

  it("draws the ghost edge's label chip too, matching the eventual copy", () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    renderLayer({
      diagram: stateWith({
        nodes,
        edges: [edge({ label: 'yes' })],
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
        ],
      }),
    });
    const el = screen.getByTestId('diagram-node-a');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0, altKey: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 0, altKey: true });

    expect(screen.getByTestId('diagram-option-drag-ghosts').textContent).toContain('yes');
  });
});

describe('DiagramLayer option-drag with the real reducer (review finding 1)', () => {
  it('creates the copies once, at pointer up, leaving the original in place; one undo removes them', () => {
    const dispatchRef: { current: (action: DiagramAction) => void } = { current: () => {} };
    render(
      <RealReducerHarness
        initial={stateWith({
          nodes: [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 })],
          selection: [{ type: 'node', id: 'a' }],
        })}
        dispatchRef={dispatchRef}
      />,
    );
    const el = screen.getByTestId('diagram-node-a');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0, altKey: true });
    expect(screen.queryAllByTestId(/^diagram-node-/)).toHaveLength(1);

    fireEvent.pointerMove(el, { pointerId: 1, clientX: 120, clientY: 0, altKey: true });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 120, clientY: 0, altKey: true });

    expect(screen.queryAllByTestId(/^diagram-node-/)).toHaveLength(2);
    expect(screen.getByTestId('diagram-node-a').querySelector('rect')).toHaveAttribute('x', '0');

    act(() => dispatchRef.current({ type: 'undo' }));

    expect(screen.queryAllByTestId(/^diagram-node-/)).toHaveLength(1);
    expect(screen.getByTestId('diagram-node-a').querySelector('rect')).toHaveAttribute('x', '0');
  });

  it('Option-click with no movement creates nothing', () => {
    render(
      <RealReducerHarness
        initial={stateWith({ nodes: [node({ id: 'a' })], selection: [{ type: 'node', id: 'a' }] })}
      />,
    );
    const el = screen.getByTestId('diagram-node-a');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true });
    expect(screen.queryAllByTestId(/^diagram-node-/)).toHaveLength(1);
  });

  it('Option-right-click creates nothing', () => {
    render(
      <RealReducerHarness
        initial={stateWith({ nodes: [node({ id: 'a' })], selection: [{ type: 'node', id: 'a' }] })}
      />,
    );
    const el = screen.getByTestId('diagram-node-a');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 130, altKey: true, button: 2 });
    fireEvent.contextMenu(el);
    expect(screen.queryAllByTestId(/^diagram-node-/)).toHaveLength(1);
  });

  it('a connector to a frame is carried when both the shape and the frame side survive the duplicate (only the node duplicates, the frame connection is not carried)', () => {
    // A frame is never duplicated (it is not a diagram node), so a
    // connector from a duplicated shape to a frame is correctly left
    // behind on the original - only node-to-node connectors are ever
    // copied. This pins that a screenId endpoint never confuses the
    // ghost/ real-reducer path into throwing or miscounting edges.
    const frames: DiagramFrameBox[] = [{ id: 'screen1', x: 300, y: 0, width: 400, height: 800 }];
    render(
      <RealReducerHarness
        initial={stateWith({
          nodes: [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 })],
          edges: [edge({ id: 'e1', source: { nodeId: 'a', side: 'right' }, target: { screenId: 'screen1', side: 'left' } })],
          selection: [{ type: 'node', id: 'a' }],
        })}
        frames={frames}
      />,
    );
    const el = screen.getByTestId('diagram-node-a');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0, altKey: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 120, clientY: 0, altKey: true });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 120, clientY: 0, altKey: true });

    expect(screen.queryAllByTestId(/^diagram-node-/)).toHaveLength(2);
    expect(screen.queryAllByTestId(/^diagram-edge-hit-/)).toHaveLength(1);
  });

  // Re-review finding 26: the ghost edge's path was pinned to EXIST
  // (review finding 23's tests) but never to equal what actually lands -
  // the real point of a preview, and the same "what you see is what you
  // get" rule findings 20/21 pin for shapes.
  it("the ghost edge's path equals the committed copy's edge path after pointer up", () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    render(
      <RealReducerHarness
        initial={stateWith({
          nodes,
          edges: [edge()], // source a/right, target b/left
          selection: [
            { type: 'node', id: 'a' },
            { type: 'node', id: 'b' },
          ],
        })}
      />,
    );
    const el = screen.getByTestId('diagram-node-a');

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0, altKey: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 40, clientY: 24, altKey: true });

    const ghostPath = screen.getByTestId('diagram-option-drag-ghosts').querySelector('path')!.getAttribute('d');
    expect(ghostPath).toBeTruthy();

    fireEvent.pointerUp(el, { pointerId: 1, clientX: 40, clientY: 24, altKey: true });

    const hitPaths = screen.getAllByTestId(/^diagram-edge-hit-/);
    expect(hitPaths).toHaveLength(2); // the original, untouched, plus the copy
    const copyPath = hitPaths.find((hit) => hit.getAttribute('data-testid') !== 'diagram-edge-hit-edge0000001')!;

    expect(copyPath.getAttribute('d')).toBe(ghostPath);
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

  // Review nits 11/12: Figma shows the copy cursor (and lets Option-drag
  // act) on ANY hovered shape, not only an already-selected one.
  it('adds cursor-copy to a hovered shape that is NOT selected too', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    fireEvent.keyDown(window, { key: 'Alt' });
    expect(screen.getByTestId('diagram-node-node000001')).toHaveClass('cursor-copy');
  });

  it('does not add cursor-copy to a shape that is selected but not hovered', () => {
    renderLayer({
      diagram: stateWith({
        nodes: [node({ x: 0, y: 0, width: 100, height: 50 })],
        selection: [{ type: 'node', id: 'node000001' }],
      }),
    });
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

  // Review finding 10's test-gap list: this test used to only check
  // removeEventListener('keydown', anyFunction) was called AT ALL - which
  // passes even if one of the layer's several keydown listeners (Alt
  // tracking, Shift+F10, Escape) leaked, as long as at least one of the
  // others was cleaned up. Counting add/remove calls per event name catches
  // that a real leak would not.
  it('removes exactly as many window listeners on unmount as it added, per event name', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { unmount } = renderLayer();
    const added = countByEventName(addSpy);
    expect(Object.keys(added).length).toBeGreaterThan(0);

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    unmount();
    const removed = countByEventName(removeSpy);

    expect(removed).toEqual(added);
    addSpy.mockRestore();
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

  // Review nit 16: role="button" with no tabIndex/keyboard path is an
  // unfocusable button - dropped rather than adding a full keyboard path.
  it('is not falsely marked as a focusable button', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).not.toHaveAttribute('role', 'button');
  });

  // Review nit 15: a double-click bubbling to the shape's own onDoubleClick
  // moved the editor onto the SOURCE shape instead of the new one.
  it('a double-click does not open the inline editor on the source shape', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    fireEvent.doubleClick(screen.getByTestId('diagram-quick-add-node000001-right'));
    expect(screen.queryByTestId('diagram-text-input-node000001')).not.toBeInTheDocument();
  });

  // Review nit 15: hides the circles once one has fired, so the second
  // click of an accidental double-click cannot land on a circle that is
  // still there and create a second, stacked shape.
  it('hides the circles once one has fired', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    fireEvent.click(screen.getByTestId('diagram-quick-add-node000001-right'));
    expect(screen.queryByTestId('diagram-quick-add-node000001-right')).not.toBeInTheDocument();
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

  // Bug fix (Matt): "when i mouse over a diagram shape, i see the + icons.
  // however, i can't reach them when i mouse over to them. they disappear
  // because i'm not 'over' the shape anymore." The pointer travelling from
  // the box toward a circle crosses a screen-space gap that used to be
  // inside neither the box (boxContains) nor any circle's own disc (the old
  // isOverQuickAddCircle check) - hiding the circles mid-crossing, before
  // the cursor could ever reach one.
  it('stays visible while the pointer crosses the gap between the box edge and a quick-add circle', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();

    // Past the box's right edge (100) but short of the right circle's own
    // disc (centered at 120, radius 10, so its near edge is at 110) -
    // squarely in the gap a naive box-or-circle check leaves uncovered.
    hoverAt(105, 25);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();
  });

  it('stays visible over the circle itself, where a click still adds a shape', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    hoverAt(105, 25);
    // Dead center of the right circle (box edge at 100, plus the 20px gap).
    hoverAt(120, 25);

    const circle = screen.getByTestId('diagram-quick-add-node000001-right');
    expect(circle).toBeInTheDocument();
    fireEvent.click(circle);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'quickAdd', sourceId: 'node000001', side: 'right' }));
  });

  it('hides once the pointer moves beyond the halo', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }) });
    hoverAt(50, 25);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();

    // The halo reaches QUICK_ADD_GAP_SCREEN (20) + the circle's diameter
    // (20) + a few px of slack past the box's edge at x=100 - comfortably
    // past the circle itself (centered at 120), but 150 clears even the
    // most generous reading of that margin.
    hoverAt(150, 25);
    expect(screen.queryByTestId('diagram-quick-add-node000001-right')).not.toBeInTheDocument();
  });

  // The gap/halo constants (QUICK_ADD_GAP_SCREEN etc.) are screen px,
  // converted to canvas units by DIVIDING by zoom (the same reasoning
  // review item 12, above, already applies to the circle's own radius/icon
  // size) - a pointer offset by a fixed number of CLIENT (screen) px from
  // the box's own edge should land in the same place relative to the gap
  // and halo at any zoom, since client = canvas * zoom cancels the zoom
  // this test's own point deliberately divides out.
  it('scales the halo down, in canvas units, at zoom 2, so the gap-crossing fix still holds there', () => {
    renderLayer({
      diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }),
      viewport: { x: 0, y: 0, zoom: 2 },
    });
    // clientToCanvas divides by zoom: client (100, 50) -> canvas (50, 25),
    // the box's own center. The box's own right edge (canvas x=100) is at
    // client x=200 here.
    hoverAt(100, 50);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();

    // 5 CLIENT px past the box's right edge (200 + 5 = 205): inside the
    // gap at any zoom (canvas x = 100 + 5/2 = 102.5, short of the circle's
    // own near edge at 100 + 10/2 = 105) - the same bug as the base gap
    // test above, re-shown at a different zoom.
    hoverAt(205, 50);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();

    // 60 CLIENT px past the same edge (260): beyond the zoom-2 halo (margin
    // 44 / 2 = 22 canvas units, i.e. 44 client px, reaching only to client
    // x=244).
    hoverAt(260, 50);
    expect(screen.queryByTestId('diagram-quick-add-node000001-right')).not.toBeInTheDocument();
  });

  it('scales the halo up, in canvas units, at zoom 0.5, so the gap-crossing fix still holds there', () => {
    renderLayer({
      diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }),
      viewport: { x: 0, y: 0, zoom: 0.5 },
    });
    // clientToCanvas divides by zoom: client (50, 12.5) -> canvas (100, 25),
    // the box's own right edge - client (25, 12.5) is its own center.
    hoverAt(25, 12.5);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();

    // 5 CLIENT px past the box's right edge (50 + 5 = 55): inside the gap
    // at any zoom (canvas x = 100 + 5/0.5 = 110, short of the circle's own
    // near edge at 100 + 10/0.5 = 120).
    hoverAt(55, 12.5);
    expect(screen.getByTestId('diagram-quick-add-node000001-right')).toBeInTheDocument();

    // 60 CLIENT px past the same edge (110): beyond the zoom-0.5 halo
    // (margin 44 / 0.5 = 88 canvas units, i.e. 44 client px, reaching only
    // to client x=94).
    hoverAt(110, 12.5);
    expect(screen.queryByTestId('diagram-quick-add-node000001-right')).not.toBeInTheDocument();
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

  // Review item 12: the circle's own radius/icon size, and hoverAt's own
  // hit-testing, are computed by DIVIDING by viewport.zoom - a scale bug in
  // that math would only ever surface away from zoom 1, so this repeats the
  // stopPropagation/dispatch coverage above at zoom 0.5, with real pointer
  // events (pointerdown, then click) rather than fireEvent.click alone,
  // since only a pointerdown actually exercises the bubble this guards.
  it('stopPropagation on its own pointerdown still holds at a 0.5 zoom, so the shape underneath never starts its own select/drag', () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node({ x: 0, y: 0, width: 100, height: 50 })] }),
      viewport: { x: 0, y: 0, zoom: 0.5 },
    });
    // clientToCanvas divides by zoom, so half the client distance reaches
    // the same canvas point (50, 25) - the node's own center - as at zoom 1.
    hoverAt(25, 12.5);
    const circle = screen.getByTestId('diagram-quick-add-node000001-right');

    fireEvent.pointerDown(circle, { pointerId: 1, clientX: 65, clientY: 12.5 });
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.click(circle);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'quickAdd', sourceId: 'node000001', side: 'right' }));
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

describe("DiagramLayer reconnecting a connector's end (spec section 12, Matt 2026-09-14)", () => {
  function twoNodeEdgeState(selection: DiagramState['selection'] = [{ type: 'edge', id: 'e1' }]): DiagramState {
    const nodes = [
      node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }),
      node({ id: 'b', x: 300, y: 0, width: 100, height: 50 }),
      node({ id: 'c', x: 300, y: 300, width: 100, height: 50 }),
    ];
    const edges = [edge({ id: 'e1', source: { nodeId: 'a', side: 'right' }, target: { nodeId: 'b', side: 'left' } })];
    return stateWith({ nodes, edges, selection });
  }

  it('shows a handle at each end when the connector is the sole selection', () => {
    renderLayer({ diagram: twoNodeEdgeState() });
    expect(screen.getByTestId('diagram-edge-end-e1-source')).toBeInTheDocument();
    expect(screen.getByTestId('diagram-edge-end-e1-target')).toBeInTheDocument();
  });

  it('paints both end handles after every node, so a shape can never occlude its own connector\'s handle (Matt, 2026-09-14: "dragging the connector endpoint to another point on the shape does NOTHING")', () => {
    // SVG hit-testing for overlapping elements follows DOCUMENT order, not
    // an explicit stacking context - the last-painted element wins. The
    // handle sits exactly on its shape's boundary, so if it ever again
    // rendered before that shape's own <rect>/<polygon>, the shape would
    // silently win every click meant for the handle.
    renderLayer({ diagram: twoNodeEdgeState() });
    const nodeA = screen.getByTestId('diagram-node-a');
    const nodeB = screen.getByTestId('diagram-node-b');
    const source = screen.getByTestId('diagram-edge-end-e1-source');
    const target = screen.getByTestId('diagram-edge-end-e1-target');

    for (const handle of [source, target]) {
      for (const node of [nodeA, nodeB]) {
        // DOCUMENT_POSITION_FOLLOWING (4): `node` comes before `handle`.
        expect(node.compareDocumentPosition(handle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    }
  });

  it('renders no handles when nothing is selected', () => {
    renderLayer({ diagram: twoNodeEdgeState([]) });
    expect(screen.queryByTestId('diagram-edge-end-e1-source')).not.toBeInTheDocument();
    expect(screen.queryByTestId('diagram-edge-end-e1-target')).not.toBeInTheDocument();
  });

  it('renders no handles when a node is selected alongside the connector', () => {
    renderLayer({
      diagram: twoNodeEdgeState([
        { type: 'edge', id: 'e1' },
        { type: 'node', id: 'a' },
      ]),
    });
    expect(screen.queryByTestId('diagram-edge-end-e1-source')).not.toBeInTheDocument();
    expect(screen.queryByTestId('diagram-edge-end-e1-target')).not.toBeInTheDocument();
  });

  it('shows a dashed preview path from the fixed end while dragging, gone once released', () => {
    renderLayer({ diagram: twoNodeEdgeState() });
    expect(screen.queryByTestId('diagram-endpoint-drag-preview')).not.toBeInTheDocument();

    const handle = screen.getByTestId('diagram-edge-end-e1-source');
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 25 });
    expect(screen.getByTestId('diagram-endpoint-drag-preview')).toBeInTheDocument();

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 320, clientY: 25 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 320, clientY: 25 });
    expect(screen.queryByTestId('diagram-endpoint-drag-preview')).not.toBeInTheDocument();
  });

  it('dragging the source handle onto another shape dispatches reconnect with that node id and the nearest side', () => {
    const { dispatch } = renderLayer({ diagram: twoNodeEdgeState() });
    const handle = screen.getByTestId('diagram-edge-end-e1-source');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 350, clientY: 305 }); // near the top of node c
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 350, clientY: 305 });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'reconnect',
      id: 'e1',
      end: 'source',
      endpoint: { nodeId: 'c', side: 'top' },
    });
  });

  it('dropping on a different side of the SAME shape moves the end there (not a no-op)', () => {
    const { dispatch } = renderLayer({ diagram: twoNodeEdgeState() });
    const handle = screen.getByTestId('diagram-edge-end-e1-target'); // currently node b / left

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 300, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 350, clientY: 5 }); // top of node b
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 350, clientY: 5 });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'reconnect',
      id: 'e1',
      end: 'target',
      endpoint: { nodeId: 'b', side: 'top' },
    });
  });

  it('dropping on empty canvas dispatches nothing', () => {
    const { dispatch } = renderLayer({ diagram: twoNodeEdgeState() });
    const handle = screen.getByTestId('diagram-edge-end-e1-source');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 900, clientY: 900 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 900, clientY: 900 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reconnect' }));
  });

  it('Escape resets the gesture, writing nothing; the following pointerup is a no-op', () => {
    const { dispatch } = renderLayer({ diagram: twoNodeEdgeState() });
    const handle = screen.getByTestId('diagram-edge-end-e1-source');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 350, clientY: 305 });

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 350, clientY: 305 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reconnect' }));
    expect(screen.queryByTestId('diagram-endpoint-drag-preview')).not.toBeInTheDocument();
  });

  it('pointercancel resets the gesture without dispatching', () => {
    const { dispatch } = renderLayer({ diagram: twoNodeEdgeState() });
    const handle = screen.getByTestId('diagram-edge-end-e1-source');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 350, clientY: 305 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reconnect' }));
    expect(screen.queryByTestId('diagram-endpoint-drag-preview')).not.toBeInTheDocument();
  });

  it('dragging onto a frame dispatches reconnect with a screenId endpoint', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    const edges = [edge({ id: 'e1', source: { nodeId: 'a', side: 'right' }, target: { nodeId: 'b', side: 'left' } })];
    const frames: DiagramFrameBox[] = [{ id: 'screen1', x: 300, y: 300, width: 400, height: 800 }];
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes, edges, selection: [{ type: 'edge', id: 'e1' }] }),
      frames,
    });
    const handle = screen.getByTestId('diagram-edge-end-e1-source');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 320, clientY: 320 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 320, clientY: 320 });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'reconnect',
      id: 'e1',
      end: 'source',
      endpoint: { screenId: 'screen1', side: 'top' },
    });
  });

  // The layer must not pre-filter a self-loop drop the way endConnect
  // excludes its own drag source - it has to actually dispatch `reconnect`
  // and let the real reducer's validateConnection refuse it (spec: "same
  // rule as connect"), so this drives the gesture against RealReducerHarness
  // and confirms the edge itself never changes.
  it('a self-loop reconnect is refused end-to-end by the real reducer', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }), node({ id: 'b', x: 300, y: 0, width: 100, height: 50 })];
    const edges = [edge({ id: 'e1', source: { nodeId: 'a', side: 'right' }, target: { nodeId: 'b', side: 'left' } })];
    render(<RealReducerHarness initial={stateWith({ nodes, edges, selection: [{ type: 'edge', id: 'e1' }] })} />);

    const before = screen.getByTestId('diagram-edge-hit-e1').getAttribute('d');

    // Drags the TARGET end back onto node a, the SOURCE end's own shape -
    // source and target would both resolve to node a, a self-loop.
    const handle = screen.getByTestId('diagram-edge-end-e1-target');
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 25 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 50, clientY: 25 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 50, clientY: 25 });

    expect(screen.getByTestId('diagram-edge-hit-e1').getAttribute('d')).toBe(before);
    // The connector is still selected and still has both its end handles -
    // a refused reconnect must leave the selection/gesture state usable,
    // not just the document.
    expect(screen.getByTestId('diagram-edge-end-e1-source')).toBeInTheDocument();
    expect(screen.getByTestId('diagram-edge-end-e1-target')).toBeInTheDocument();
  });
});

describe('DiagramLayer context menu (shape)', () => {
  it('selects an unselected shape when right-clicked', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node()] }) });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'node000001' }] });
  });

  // Review nit 17: unlike the Shift+F10 path, the Trigger had no
  // tool.kind === 'pointer' guard, so the menu also opened mid-connector-
  // tool/placement.
  it('does not open while the connector tool is active', () => {
    renderLayer({ diagram: stateWith({ nodes: [node()] }), tool: { kind: 'connector' } });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    expect(screen.queryByRole('menuitem', { name: 'Edit text' })).not.toBeInTheDocument();
  });

  // Re-review finding 24: Radix still calls a DISABLED trigger's own
  // onContextMenu straight through (disabling only stops ITS content from
  // opening) - so ensureSelected ran and silently changed the selection
  // in the connector/shape tools even though no menu ever appeared. The
  // handler itself now checks tool.kind, not just the Trigger's `disabled`.
  it('does not change the selection on right-click while the connector tool is active either', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node()] }), tool: { kind: 'connector' } });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    expect(dispatch).not.toHaveBeenCalled();
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
      'Color',
      'Text',
      'Align',
      'Edit text',
      'Duplicate',
      'Bring to front',
      'Send to back',
      'Export as PNG',
      'Export as SVG',
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

  it('"Color" checks the current color and dispatches setColor on another', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node({ color: 'blue' })], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Color' }));

    expect(screen.getByRole('menuitemradio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Green' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'setColor', ids: ['node000001'], color: 'green' });
  });

  // Spec section 9: "the right-click menu gets a 'Text' submenu with the
  // same three groups as radio items" - each of Text size/Font/Text color
  // is its own nested submenu, mirroring "Change shape"/"Color" above, and
  // (like those two) restyles only the right-clicked shape, not the whole
  // selection.
  it('"Text" > "Text size" checks the current size and dispatches setTextStyle on another', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node({ textSize: 'large' })], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Text' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Text size' }));

    expect(screen.getByRole('menuitemradio', { name: 'Large' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Small' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTextStyle', ids: ['node000001'], textSize: 'small' });
  });

  it('"Text" > "Font" defaults to Sans, checks the current font and dispatches setTextStyle on another', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Text' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Font' }));

    expect(screen.getByRole('menuitemradio', { name: 'Sans' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Mono' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTextStyle', ids: ['node000001'], textFont: 'mono' });
  });

  it('"Text" > "Text color" checks the current color and dispatches setTextStyle on another', async () => {
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [node({ textColor: 'violet' })], selection: [{ type: 'node', id: 'node000001' }] }),
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Text' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Text color' }));

    expect(screen.getByRole('menuitemradio', { name: 'Violet' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Black' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTextStyle', ids: ['node000001'], textColor: 'black' });
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

  it('"Export as PNG" calls onExport with format "png"', async () => {
    const onExport = vi.fn();
    renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
      onExport,
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Export as PNG' }));
    expect(onExport).toHaveBeenCalledWith('png');
  });

  it('"Export as SVG" calls onExport with format "svg"', async () => {
    const onExport = vi.fn();
    renderLayer({
      diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }),
      onExport,
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Export as SVG' }));
    expect(onExport).toHaveBeenCalledWith('svg');
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

  // Review finding 3: previously required EXACTLY one selected element, so
  // a keyboard user could never reach the Align submenu (which needs two)
  // or Distribute (three) at all.
  it('opens for a multi-selection too, anchored on the last selected item', async () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', x: 400 })];
    renderLayer({
      diagram: stateWith({
        nodes,
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
        ],
      }),
    });
    fireEvent.keyDown(window, { key: 'F10', shiftKey: true });
    expect(await screen.findByRole('menuitem', { name: 'Edit text' })).toBeInTheDocument();
  });

  // Review finding 3: also ran while focus was in an editable target (e.g.
  // the Design panel's own text fields), hijacking the browser's own
  // Shift+F10 there instead of leaving it alone.
  it('does not open while focus is in an editable target', () => {
    renderLayer({ diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }) });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: 'F10', shiftKey: true });

    expect(screen.queryByRole('menuitem', { name: 'Edit text' })).not.toBeInTheDocument();
    input.remove();
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

  // Re-review finding 24: same disabled-trigger-still-calls-onContextMenu
  // gap as the node menu, for the edge's own ensureSelected call.
  it('does not change the selection on right-click while the connector tool is active either', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes, edges: [edge()] }), tool: { kind: 'connector' } });
    fireEvent.contextMenu(screen.getByTestId('diagram-edge-hit-edge0000001'));
    expect(dispatch).not.toHaveBeenCalled();
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

  it('"Export as PNG" calls onExport with format "png"', async () => {
    const onExport = vi.fn();
    renderLayer({
      diagram: stateWith({ nodes, edges: [edge()], selection: [{ type: 'edge', id: 'edge0000001' }] }),
      onExport,
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-edge-hit-edge0000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Export as PNG' }));
    expect(onExport).toHaveBeenCalledWith('png');
  });

  it('"Export as SVG" calls onExport with format "svg"', async () => {
    const onExport = vi.fn();
    renderLayer({
      diagram: stateWith({ nodes, edges: [edge()], selection: [{ type: 'edge', id: 'edge0000001' }] }),
      onExport,
    });
    fireEvent.contextMenu(screen.getByTestId('diagram-edge-hit-edge0000001'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Export as SVG' }));
    expect(onExport).toHaveBeenCalledWith('svg');
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

// Spec docs/superpowers/specs/2026-09-13-diagrams-design.md section 10,
// build steps 2-4: groups.
describe('DiagramLayer groups: click/shift-click selection', () => {
  it('clicking a grouped shape selects all members of its group', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes }) });
    fireEvent.pointerDown(screen.getByTestId('diagram-node-a'), { pointerId: 1, clientX: 150, clientY: 130 });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'select',
      selection: expect.arrayContaining([
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
      ]),
    });
    const call = dispatch.mock.calls.find((c) => c[0].type === 'select');
    expect(call![0].selection).toHaveLength(2);
  });

  it('clicking a grouped shape also selects the connector between members', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    const edges = [edge({ id: 'e1', source: { nodeId: 'a', side: 'right' }, target: { nodeId: 'b', side: 'left' } })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes, edges }) });
    fireEvent.pointerDown(screen.getByTestId('diagram-node-a'), { pointerId: 1, clientX: 150, clientY: 130 });
    const call = dispatch.mock.calls.find((c) => c[0].type === 'select');
    expect(call![0].selection).toEqual(
      expect.arrayContaining([
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
        { type: 'edge', id: 'e1' },
      ]),
    );
  });

  it('clicking an ungrouped shape still selects just that one shape', () => {
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes: [node()] }) });
    fireEvent.pointerDown(screen.getByTestId('diagram-node-node000001'), { pointerId: 1, clientX: 150, clientY: 130 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'node000001' }] });
  });

  it('shift+click on a member adds the whole group to the selection', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' }), node({ id: 'c', x: 800 })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes, selection: [{ type: 'node', id: 'c' }] }) });
    fireEvent.pointerDown(screen.getByTestId('diagram-node-a'), { pointerId: 1, clientX: 150, clientY: 130, shiftKey: true });
    const call = dispatch.mock.calls.find((c) => c[0].type === 'select');
    expect(call![0].selection).toEqual(
      expect.arrayContaining([
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
        { type: 'node', id: 'c' },
      ]),
    );
    expect(call![0].selection).toHaveLength(3);
  });

  it('shift+click on a member of an already fully-selected group removes the whole group', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes,
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
        ],
      }),
    });
    fireEvent.pointerDown(screen.getByTestId('diagram-node-a'), { pointerId: 1, clientX: 150, clientY: 130, shiftKey: true });
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [] });
  });
});

describe('DiagramLayer groups: entering a group with double-click', () => {
  it('double-clicking a not-yet-entered member enters the group, selects just that shape, and does not start editing', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    const { dispatch } = renderLayer({
      diagram: stateWith({
        nodes,
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
        ],
      }),
    });
    fireEvent.doubleClick(screen.getByTestId('diagram-node-a'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'a' }] });
    expect(screen.queryByTestId('diagram-text-input-a')).not.toBeInTheDocument();
  });

  it('a second double-click, now inside the entered group, edits the shape\'s text instead', () => {
    const nodes = [node({ id: 'a', groupId: 'g1', text: 'Hello' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    renderLayer({
      diagram: stateWith({
        nodes,
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
        ],
      }),
    });
    fireEvent.doubleClick(screen.getByTestId('diagram-node-a'));
    fireEvent.doubleClick(screen.getByTestId('diagram-node-a'));
    expect(screen.getByTestId('diagram-text-input-a')).toBeInTheDocument();
  });

  it('double-clicking an ungrouped shape still starts editing directly, unaffected', () => {
    renderLayer({ diagram: stateWith({ nodes: [node({ text: 'Hello' })] }) });
    fireEvent.doubleClick(screen.getByTestId('diagram-node-node000001'));
    expect(screen.getByTestId('diagram-text-input-node000001')).toBeInTheDocument();
  });

  it('once entered via double-click, a plain click on another member of the same group selects just that member (real reducer)', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    render(
      <RealReducerHarness
        initial={stateWith({
          nodes,
          selection: [
            { type: 'node', id: 'a' },
            { type: 'node', id: 'b' },
          ],
        })}
      />,
    );
    fireEvent.doubleClick(screen.getByTestId('diagram-node-a'));
    expect(screen.getByTestId('diagram-node-a')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('diagram-node-b')).not.toHaveAttribute('data-selected');

    fireEvent.pointerDown(screen.getByTestId('diagram-node-b'), { pointerId: 1, clientX: 450, clientY: 130 });
    expect(screen.getByTestId('diagram-node-b')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('diagram-node-a')).not.toHaveAttribute('data-selected');
  });

  it('clicking a different, ungrouped shape leaves the entered group - a later click on a former group member selects the whole group again (real reducer)', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' }), node({ id: 'c', x: 800 })];
    render(<RealReducerHarness initial={stateWith({ nodes, selection: [{ type: 'node', id: 'a' }] })} />);
    fireEvent.doubleClick(screen.getByTestId('diagram-node-a')); // enters g1
    fireEvent.pointerDown(screen.getByTestId('diagram-node-c'), { pointerId: 1, clientX: 850, clientY: 130 }); // ungrouped, unrelated
    fireEvent.pointerUp(screen.getByTestId('diagram-node-c'), { pointerId: 1, clientX: 850, clientY: 130 });

    fireEvent.pointerDown(screen.getByTestId('diagram-node-a'), { pointerId: 2, clientX: 150, clientY: 130 });
    // The whole group is selected again (not just 'a') - visible as the
    // shared group outline, since a fully-selected group's own members no
    // longer carry the individual data-selected attribute (see the
    // "selected-group outline" describe block below).
    expect(screen.getByTestId('diagram-group-outline-g1')).toBeInTheDocument();
  });
});

describe('DiagramLayer groups: selected-group outline', () => {
  it('draws one dashed outline around a fully-selected group instead of per-member outlines and handles', () => {
    const nodes = [
      node({ id: 'a', groupId: 'g1', x: 0, y: 0, width: 40, height: 40 }),
      node({ id: 'b', groupId: 'g1', x: 100, y: 100, width: 40, height: 40 }),
    ];
    renderLayer({
      diagram: stateWith({
        nodes,
        selection: [
          { type: 'node', id: 'a' },
          { type: 'node', id: 'b' },
        ],
      }),
    });
    expect(screen.getByTestId('diagram-group-outline-g1')).toBeInTheDocument();
    expect(screen.queryByTestId('diagram-resize-a-se')).not.toBeInTheDocument();
    expect(screen.queryByTestId('diagram-resize-b-se')).not.toBeInTheDocument();
  });

  it('does not draw a group outline when only one member is selected', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    renderLayer({ diagram: stateWith({ nodes, selection: [{ type: 'node', id: 'a' }] }) });
    expect(screen.queryByTestId('diagram-group-outline-g1')).not.toBeInTheDocument();
    // The individually-selected member keeps its own ordinary outline/handles.
    expect(screen.getByTestId('diagram-resize-a-se')).toBeInTheDocument();
  });
});

describe('DiagramLayer context menu (Group/Ungroup, build step 4)', () => {
  it('disables Group with fewer than two shapes selected', async () => {
    renderLayer({ diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }) });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    expect(await screen.findByRole('menuitem', { name: 'Group' })).toHaveAttribute('data-disabled');
  });

  it('enables Group with two or more shapes selected, and dispatches group for the whole selection', async () => {
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
    const groupItem = await screen.findByRole('menuitem', { name: 'Group' });
    expect(groupItem).not.toHaveAttribute('data-disabled');

    await userEvent.click(groupItem);
    expect(dispatch).toHaveBeenCalledWith({ type: 'group', ids: ['a', 'b'], groupId: expect.any(String) });
  });

  it('disables Ungroup when the selection is not a group', async () => {
    renderLayer({ diagram: stateWith({ nodes: [node()], selection: [{ type: 'node', id: 'node000001' }] }) });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-node000001'));
    expect(await screen.findByRole('menuitem', { name: 'Ungroup' })).toHaveAttribute('data-disabled');
  });

  it('enables Ungroup when the selection is a whole group, and dispatches ungroup for it', async () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
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
    const ungroupItem = await screen.findByRole('menuitem', { name: 'Ungroup' });
    expect(ungroupItem).not.toHaveAttribute('data-disabled');

    await userEvent.click(ungroupItem);
    expect(dispatch).toHaveBeenCalledWith({ type: 'ungroup', groupId: 'g1' });
  });

  it('deleting via the context menu while a group is selected removes every member', async () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
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
});

describe('DiagramLayer groups: drag acts on the whole group (spec: "already act on the selection and therefore on groups")', () => {
  it('dragging one member of a selected group moves every member together', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
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
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 158, clientY: 130 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 158, clientY: 130 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'move', ids: ['a', 'b'], dx: 8, dy: 0 });
  });
});

describe('DiagramLayer quick-add from a grouped shape (spec: "adds the new shape outside the group")', () => {
  it('the quick-add dispatch names only the source shape - the reducer itself never copies a groupId onto the new node (see store.test.ts)', () => {
    const nodes = [node({ id: 'node000001', groupId: 'g1' })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes }) });
    hoverAt(150, 130);
    fireEvent.click(screen.getByTestId('diagram-quick-add-node000001-right'));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quickAdd', sourceId: 'node000001', side: 'right' }),
    );
  });
});

// Review finding A: right-clicking an unselected grouped shape used to
// select only that one shape while still showing "Ungroup" as available -
// choosing it then silently stripped groupId from sibling nodes that were
// never selected or visible in the menu at all. ensureSelected now expands
// to the whole group first, the same as a plain click would.
describe('DiagramLayer context menu on an unselected grouped shape (review finding A)', () => {
  it('right-clicking an unselected member selects the whole group, not just that one shape', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    const { dispatch } = renderLayer({ diagram: stateWith({ nodes, selection: [] }) });
    fireEvent.contextMenu(screen.getByTestId('diagram-node-a'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'select',
      selection: expect.arrayContaining([
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
      ]),
    });
    const call = dispatch.mock.calls.find((c) => c[0].type === 'select');
    expect(call![0].selection).toHaveLength(2);
  });

  it('end-to-end with the real reducer: the whole group is visibly selected and Ungroup correctly shows as available (no silent action on an invisible sibling)', async () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    render(<RealReducerHarness initial={stateWith({ nodes, selection: [] })} />);
    fireEvent.contextMenu(screen.getByTestId('diagram-node-a'));

    // The whole group is now genuinely selected (shown as one shared
    // outline, since a fully-selected 2-member group suppresses each
    // member's own data-selected - see the "selected-group outline"
    // describe block above).
    expect(screen.getByTestId('diagram-group-outline-g1')).toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: 'Ungroup' })).not.toHaveAttribute('data-disabled');
  });

  it('right-clicking an unselected member while "inside" a DIFFERENT entered group still selects just that member, not the whole group', () => {
    const groupNodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    const other = node({ id: 'c', x: 800, groupId: 'g1' });
    // Not a realistic 3-member "entered" scenario by itself - this test
    // only cares that ensureSelected respects enteredGroupId the same way
    // a plain click does, via the shared groupSelectionFor helper.
    const { dispatch } = renderLayer({
      diagram: stateWith({ nodes: [...groupNodes, other], selection: [] }),
    });
    // Enter g1 via double-click on 'a' first.
    fireEvent.doubleClick(screen.getByTestId('diagram-node-a'));
    dispatch.mockClear();
    // Right-click the OTHER still-unselected member of the SAME (now
    // entered) group - should select just 'b', not the whole group.
    fireEvent.contextMenu(screen.getByTestId('diagram-node-b'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'b' }] });
  });
});

// Review finding B: deleting one member of a group must not leave the
// survivor's groupId orphaned. Confirmed here end-to-end (real reducer):
// after group -> delete one member -> the survivor keeps its own
// resize handles when selected alone, rather than being stuck behind a
// permanent group-of-one outline.
describe('DiagramLayer: deleting a partial group leaves a real, still-usable survivor (review finding B)', () => {
  it('the surviving member of a 2-member group gets its own resize handles back after the other is deleted', () => {
    const nodes = [node({ id: 'a', groupId: 'g1' }), node({ id: 'b', x: 400, groupId: 'g1' })];
    const dispatchRef: { current: (action: DiagramAction) => void } = { current: () => {} };
    render(<RealReducerHarness initial={stateWith({ nodes })} dispatchRef={dispatchRef} />);

    act(() => {
      dispatchRef.current({ type: 'delete', ids: ['a'] });
      dispatchRef.current({ type: 'select', selection: [{ type: 'node', id: 'b' }] });
    });

    expect(screen.queryByTestId('diagram-group-outline-g1')).not.toBeInTheDocument();
    expect(screen.getByTestId('diagram-resize-b-se')).toBeInTheDocument();
    expect(screen.getByTestId('diagram-node-b')).toHaveAttribute('data-selected', 'true');
  });
});
