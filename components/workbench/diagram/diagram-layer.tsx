'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { nanoid } from 'nanoid';
import {
  anchorOnBox,
  getBezierPath,
  getHandlePosition,
  getSmoothStepPath,
  getStraightPath,
  sideFromPoint,
  snapToGrid,
  type Box,
  type Point,
  type Side,
} from '@/lib/diagram/geometry';
import {
  MAX_TEXT_LENGTH,
  MIN_SIZE,
  type DiagramAction,
  type DiagramEdge,
  type DiagramNode,
  type DiagramNodeKind,
  type DiagramSelection,
  type DiagramState,
  type EdgeEndpoint,
  type Side as StoreSide,
} from '@/lib/diagram/store';
import type { Viewport } from '@/lib/canvas/viewport';
import { capturePointer } from '@/lib/dom';
import { CHIP } from '../chrome';

// The tool the diagram palette (diagram-palette.tsx) put the canvas in:
// plain selection, about to place a specific shape kind, or about to draw a
// connector. Owned by whoever renders both DiagramPalette and DiagramLayer
// (components/workbench/canvas.tsx / workbench.tsx), not by this layer
// itself, since the top bar's Diagram tool button and Shift+D need to reach
// the very same state.
export type DiagramTool = { kind: 'pointer' } | { kind: 'shape'; shape: DiagramNodeKind } | { kind: 'connector' };

export const POINTER_TOOL: DiagramTool = { kind: 'pointer' };

export interface DiagramFrameBox extends Box {
  id: string;
}

export interface DiagramLayerProps {
  diagram: DiagramState;
  dispatch: (action: DiagramAction) => void;
  // The current page's frames, in canvas-space - a connector can anchor to
  // one of these the same way it anchors to a diagram node (spec: "a frame
  // can be a source or target; its anchor is the frame box").
  frames: readonly DiagramFrameBox[];
  viewport: Viewport;
  tool: DiagramTool;
  // Called once a shape has actually been placed (click or drag-to-size) or
  // a placement/connect gesture is cancelled - the caller (WorkbenchShell)
  // returns the tool to pointer, same as Escape/V already do.
  onToolConsumed: () => void;
}

const DEFAULT_SIZE: Record<DiagramNodeKind, { width: number; height: number }> = {
  rect: { width: 160, height: 80 },
  rounded: { width: 160, height: 80 },
  decision: { width: 160, height: 100 },
  terminal: { width: 140, height: 56 },
  text: { width: 140, height: 40 },
  note: { width: 140, height: 100 },
};

// Screen-px, not canvas-px: a placement click that moves less than this
// counts as a plain click (place at the default size) rather than a
// drag-to-size, regardless of zoom.
const PLACEMENT_CLICK_THRESHOLD = 4;
// Screen-px radius of a connect/hover handle - kept in screen space (divided
// by zoom before use) so handles stay a constant, easy-to-hit size at any
// zoom level, the same reasoning lib/canvas/viewport.ts's own padding
// constants document elsewhere.
const HANDLE_RADIUS = 5;
const RESIZE_HANDLE_SIZE = 8;

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

const COLOR_CLASSES: Record<DiagramNode['color'], { fill: string; stroke: string }> = {
  neutral: { fill: 'fill-white/10', stroke: 'stroke-white/50' },
  blue: { fill: 'fill-blue-500/25', stroke: 'stroke-blue-400' },
  green: { fill: 'fill-green-500/25', stroke: 'stroke-green-400' },
  amber: { fill: 'fill-amber-500/25', stroke: 'stroke-amber-400' },
  red: { fill: 'fill-red-500/25', stroke: 'stroke-red-400' },
  violet: { fill: 'fill-violet-500/25', stroke: 'stroke-violet-400' },
};

function boxContains(box: Box, point: Point): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

function isSelected(selection: DiagramSelection, type: 'node' | 'edge', id: string): boolean {
  return selection.some((item) => item.type === type && item.id === id);
}

type HoverTarget = { type: 'node' | 'frame'; id: string } | null;

type DragState = { pointerId: number; ids: string[]; start: Point } | null;
type ResizeState = {
  pointerId: number;
  id: string;
  corner: 'nw' | 'ne' | 'sw' | 'se';
  start: Point;
  box: Box;
} | null;
type ConnectSource = { type: 'node' | 'frame'; id: string; side: Side };
type ConnectState = { pointerId: number; source: ConnectSource; anchor: Point; current: Point } | null;
type PlaceState = { pointerId: number; start: Point; current: Point } | null;
type EditState = { id: string; draft: string } | null;

function endpointFor(target: { type: 'node' | 'frame'; id: string }, side: Side): EdgeEndpoint {
  return target.type === 'node' ? { nodeId: target.id, side } : { screenId: target.id, side };
}

/**
 * The one SVG layer that draws every diagram shape and connector inside the
 * canvas transform layer (spec docs/superpowers/specs/2026-09-13-diagrams-
 * design.md section 3), rendered by components/workbench/canvas.tsx as a
 * sibling of the frames, after them in DOM order so it paints above them.
 * Sits at canvas-space (0,0) with no size of its own (`overflow: visible`),
 * so every coordinate below is a plain canvas-space number - the parent's
 * own CSS transform (pan/zoom) already does the rest, the same trick
 * frame-title.tsx and the frame wrappers in canvas.tsx already rely on.
 *
 * The root's pointer-events flips to `auto` only while a placement tool is
 * active (`tool.kind !== 'pointer'`): idle, it is `none` so every click
 * still reaches the frames beneath it untouched (spec: "pointer-events:
 * none on the SVG root, pointer-events: all on shapes, edges and handles"),
 * but placing a shape needs the WHOLE canvas clickable, not just existing
 * shapes/handles.
 */
export function DiagramLayer({ diagram, dispatch, frames, viewport, tool, onToolConsumed }: DiagramLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<HoverTarget>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [resize, setResize] = useState<ResizeState>(null);
  const [resizeBox, setResizeBox] = useState<Box | null>(null);
  const [connect, setConnect] = useState<ConnectState>(null);
  const [place, setPlace] = useState<PlaceState>(null);
  const [editing, setEditing] = useState<EditState>(null);

  function clientToCanvas(clientX: number, clientY: number): Point {
    const rect = svgRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return { x: (clientX - left) / viewport.zoom, y: (clientY - top) / viewport.zoom };
  }

  function boxFor(target: { type: 'node' | 'frame'; id: string }): Box | null {
    if (target.type === 'node') return diagram.nodes.find((n) => n.id === target.id) ?? null;
    return frames.find((f) => f.id === target.id) ?? null;
  }

  // Hover is tracked from a window-level pointermove rather than per-shape
  // listeners: the handles it reveals must appear for a FRAME too, and a
  // frame's own DOM (Stage/FramePreview, in canvas.tsx) is not this
  // component's to attach listeners to - reading the pointer's own position
  // against the known node/frame boxes works identically for both, and
  // costs nothing extra since this component already re-renders on every
  // diagram/viewport change.
  useEffect(() => {
    function onMove(event: PointerEvent) {
      // Skip while a gesture owns the pointer - a drag/resize/connect
      // already fully determines what is relevant, and hovering a
      // different shape mid-drag must not fire this shape's own hover
      // handles.
      if (drag || resize || connect || place) return;
      const point = clientToCanvas(event.clientX, event.clientY);
      const node = diagram.nodes.find((n) => boxContains(n, point));
      if (node) {
        setHover((current) => (current?.type === 'node' && current.id === node.id ? current : { type: 'node', id: node.id }));
        return;
      }
      const frame = frames.find((f) => boxContains(f, point));
      if (frame) {
        setHover((current) => (current?.type === 'frame' && current.id === frame.id ? current : { type: 'frame', id: frame.id }));
        return;
      }
      setHover((current) => (current === null ? current : null));
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
    // svgRef/clientToCanvas/boxFor are stable-shaped closures re-created
    // every render on purpose (they read live props) - re-subscribing each
    // render is cheap and keeps them always current, the same trade-off
    // canvas.tsx's own root wheel effect makes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram.nodes, frames, viewport, drag, resize, connect, place]);

  // Escape/V (handled by keyboard.tsx, driving the `tool` prop this layer
  // only reads) can change the tool away from 'shape' while a rubber-band
  // placement drag is already in progress - without this, `place` would
  // keep tracking the pointer and still add a shape on the eventual
  // pointerup, ignoring that the tool already left placement mode. Adjusted
  // during render (React's own documented alternative to a setState-in-
  // effect for "reset state when a prop changes") rather than an effect,
  // the same pattern topbar.tsx's FileNameField and workbench.tsx's
  // lastSelectedNodeId already use for the identical "did a prop I do not
  // own just change" comparison.
  const [lastToolKind, setLastToolKind] = useState(tool.kind);
  if (tool.kind !== lastToolKind) {
    setLastToolKind(tool.kind);
    if (tool.kind !== 'shape' && place !== null) setPlace(null);
  }

  function commitPendingEdit(commit: boolean): void {
    if (!editing) return;
    if (commit) dispatch({ type: 'setText', id: editing.id, text: editing.draft });
    setEditing(null);
  }

  // --- Selection --------------------------------------------------------

  function selectShape(type: 'node' | 'edge', id: string, additive: boolean): void {
    if (additive) {
      const already = isSelected(diagram.selection, type, id);
      const next = already
        ? diagram.selection.filter((item) => !(item.type === type && item.id === id))
        : [...diagram.selection, { type, id }];
      dispatch({ type: 'select', selection: next });
    } else {
      dispatch({ type: 'select', selection: [{ type, id }] });
    }
  }

  // --- Node pointer handling (select, drag, or start a connector) -------

  function handleNodePointerDown(node: DiagramNode, event: ReactPointerEvent<SVGElement>): void {
    if (editing && editing.id !== node.id) commitPendingEdit(true);
    event.stopPropagation();

    if (tool.kind === 'connector') {
      startConnect({ type: 'node', id: node.id }, sideFromPoint(node, clientToCanvas(event.clientX, event.clientY)), event);
      return;
    }
    if (tool.kind === 'shape') return;

    const additive = event.shiftKey;
    if (additive) {
      selectShape('node', node.id, true);
      return;
    }
    const alreadyMultiSelected = isSelected(diagram.selection, 'node', node.id) && diagram.selection.length > 1;
    const ids = alreadyMultiSelected
      ? diagram.selection.filter((item) => item.type === 'node').map((item) => item.id)
      : [node.id];
    if (!alreadyMultiSelected) selectShape('node', node.id, false);

    capturePointer(event.currentTarget, event.pointerId);
    setDrag({ pointerId: event.pointerId, ids, start: clientToCanvas(event.clientX, event.clientY) });
  }

  function handleDragMove(event: ReactPointerEvent<SVGElement>): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = clientToCanvas(event.clientX, event.clientY);
    setDragOffset({ dx: point.x - drag.start.x, dy: point.y - drag.start.y });
  }

  function endDrag(event: ReactPointerEvent<SVGElement>): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (dragOffset && (dragOffset.dx !== 0 || dragOffset.dy !== 0)) {
      dispatch({ type: 'move', ids: drag.ids, dx: dragOffset.dx, dy: dragOffset.dy });
    }
    setDrag(null);
    setDragOffset(null);
  }

  function renderedNodeBox(node: DiagramNode): Box {
    if (drag && drag.ids.includes(node.id) && dragOffset) {
      return { ...node, x: snapToGrid(node.x + dragOffset.dx), y: snapToGrid(node.y + dragOffset.dy) };
    }
    if (resize && resize.id === node.id && resizeBox) return resizeBox;
    return node;
  }

  // --- Resize -------------------------------------------------------------

  const CORNERS: { key: 'nw' | 'ne' | 'sw' | 'se'; dx: 0 | 1; dy: 0 | 1 }[] = [
    { key: 'nw', dx: 0, dy: 0 },
    { key: 'ne', dx: 1, dy: 0 },
    { key: 'sw', dx: 0, dy: 1 },
    { key: 'se', dx: 1, dy: 1 },
  ];

  function handleResizePointerDown(node: DiagramNode, corner: 'nw' | 'ne' | 'sw' | 'se', event: ReactPointerEvent<SVGElement>): void {
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    setResize({ pointerId: event.pointerId, id: node.id, corner, start: clientToCanvas(event.clientX, event.clientY), box: node });
  }

  function handleResizeMove(event: ReactPointerEvent<SVGElement>): void {
    if (!resize || resize.pointerId !== event.pointerId) return;
    const point = clientToCanvas(event.clientX, event.clientY);
    const dx = point.x - resize.start.x;
    const dy = point.y - resize.start.y;
    const { box, corner } = resize;
    const growsRight = corner === 'ne' || corner === 'se';
    const growsDown = corner === 'sw' || corner === 'se';
    const width = Math.max(MIN_SIZE, growsRight ? box.width + dx : box.width - dx);
    const height = Math.max(MIN_SIZE, growsDown ? box.height + dy : box.height - dy);
    const x = growsRight ? box.x : box.x + box.width - width;
    const y = growsDown ? box.y : box.y + box.height - height;
    setResizeBox({ x, y, width, height });
  }

  function endResize(event: ReactPointerEvent<SVGElement>): void {
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (resizeBox) {
      // A resize from the top or left edge (nw/ne/sw) also moves the box's
      // top-left corner - reported in this SAME dispatch (store.ts's
      // `resize` snaps x/y the same way `move` already snaps a dx/dy) so
      // undo/redo treats the whole drag as one history entry. Omitted
      // entirely, not just equal to the pre-drag value, when the corner
      // (se) never moves the box at all.
      const moved = resizeBox.x !== resize.box.x || resizeBox.y !== resize.box.y;
      dispatch({
        type: 'resize',
        id: resize.id,
        width: resizeBox.width,
        height: resizeBox.height,
        ...(moved ? { x: resizeBox.x, y: resizeBox.y } : {}),
      });
    }
    setResize(null);
    setResizeBox(null);
  }

  // --- Connect ------------------------------------------------------------

  function startConnect(source: { type: 'node' | 'frame'; id: string }, side: Side, event: ReactPointerEvent<SVGElement>): void {
    const box = boxFor(source);
    if (!box) return;
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    const anchor = getHandlePosition(box, side);
    setConnect({ pointerId: event.pointerId, source: { ...source, side }, anchor, current: clientToCanvas(event.clientX, event.clientY) });
  }

  function handleConnectMove(event: ReactPointerEvent<SVGElement>): void {
    if (!connect || connect.pointerId !== event.pointerId) return;
    setConnect({ ...connect, current: clientToCanvas(event.clientX, event.clientY) });
  }

  function endConnect(event: ReactPointerEvent<SVGElement>): void {
    if (!connect || connect.pointerId !== event.pointerId) return;
    const point = connect.current;
    const targetNode = diagram.nodes.find((n) => n.id !== connect.source.id && boxContains(n, point));
    const targetFrame = !targetNode ? frames.find((f) => boxContains(f, point)) : null;
    const target = targetNode ? { type: 'node' as const, id: targetNode.id } : targetFrame ? { type: 'frame' as const, id: targetFrame.id } : null;

    if (target) {
      const targetBox = boxFor(target)!;
      const targetSide = sideFromPoint(targetBox, point);
      dispatch({
        type: 'connect',
        edge: {
          id: nanoid(10),
          source: endpointFor(connect.source, connect.source.side),
          target: endpointFor(target, targetSide),
          kind: 'step',
          arrow: 'end',
        },
      });
    }
    setConnect(null);
    if (tool.kind === 'connector') onToolConsumed();
  }

  // --- Placement (palette shape tool) --------------------------------------

  function handlePlacePointerDown(event: ReactPointerEvent<SVGElement>): void {
    if (tool.kind !== 'shape') return;
    capturePointer(event.currentTarget, event.pointerId);
    const point = clientToCanvas(event.clientX, event.clientY);
    setPlace({ pointerId: event.pointerId, start: point, current: point });
  }

  function handlePlaceMove(event: ReactPointerEvent<SVGElement>): void {
    if (!place || place.pointerId !== event.pointerId) return;
    setPlace({ ...place, current: clientToCanvas(event.clientX, event.clientY) });
  }

  function endPlace(event: ReactPointerEvent<SVGElement>): void {
    if (!place || place.pointerId !== event.pointerId || tool.kind !== 'shape') return;
    const dxScreen = (place.current.x - place.start.x) * viewport.zoom;
    const dyScreen = (place.current.y - place.start.y) * viewport.zoom;
    const dragged = Math.hypot(dxScreen, dyScreen) >= PLACEMENT_CLICK_THRESHOLD;
    const kind = tool.shape;
    const defaultSize = DEFAULT_SIZE[kind];

    let box: Box;
    if (dragged) {
      const x = Math.min(place.start.x, place.current.x);
      const y = Math.min(place.start.y, place.current.y);
      const width = Math.max(MIN_SIZE, Math.abs(place.current.x - place.start.x));
      const height = Math.max(MIN_SIZE, Math.abs(place.current.y - place.start.y));
      box = { x: snapToGrid(x), y: snapToGrid(y), width: snapToGrid(width), height: snapToGrid(height) };
    } else {
      box = {
        x: snapToGrid(place.start.x - defaultSize.width / 2),
        y: snapToGrid(place.start.y - defaultSize.height / 2),
        width: defaultSize.width,
        height: defaultSize.height,
      };
    }

    dispatch({
      type: 'add',
      node: { id: nanoid(10), kind, x: box.x, y: box.y, width: box.width, height: box.height, text: '', color: 'neutral' },
    });
    setPlace(null);
    onToolConsumed();
  }

  // --- Edge pointer handling ------------------------------------------------

  function handleEdgePointerDown(edge: DiagramEdge, event: ReactPointerEvent<SVGElement>): void {
    if (tool.kind !== 'pointer') return;
    event.stopPropagation();
    selectShape('edge', edge.id, event.shiftKey);
  }

  // --- Inline text editing --------------------------------------------------

  function beginEditing(node: DiagramNode): void {
    if (tool.kind !== 'pointer') return;
    setEditing({ id: node.id, draft: node.text });
  }

  // --- Rendering helpers ------------------------------------------------

  function endpointBox(endpoint: EdgeEndpoint): Box | null {
    if (endpoint.nodeId) return diagram.nodes.find((n) => n.id === endpoint.nodeId) ?? null;
    if (endpoint.screenId) return frames.find((f) => f.id === endpoint.screenId) ?? null;
    return null;
  }

  // `otherBox` is the OTHER endpoint's box (pathFor below resolves both
  // boxes up front so each call can hand the far one in) - used only by the
  // no-side fallback further down, so a side-less edge anchors toward
  // wherever the far end of the connector actually is.
  function resolveEndpoint(endpoint: EdgeEndpoint, otherBox: Box | null): { box: Box; side: Side } | null {
    const box = endpointBox(endpoint);
    if (!box) return null;
    const anchorForOther = (other: Box) => anchorOnBox(box, { x: other.x + other.width / 2, y: other.y + other.height / 2 });
    if (endpoint.side && (SIDES as readonly string[]).includes(endpoint.side)) {
      return { box, side: endpoint.side as StoreSide };
    }
    // No stored side: face whichever side of `box` points toward the OTHER
    // endpoint - `otherBox`, not `box` itself. Passing `box` here (the bug
    // this fixes) made `anchorForOther` always measure toward its own
    // center, which sideFromPoint's own dx=0/dy=0 tie-break resolves to
    // "bottom" every time, regardless of where the other end of the edge
    // actually was. Falls back to `box` only when there truly is no other
    // endpoint to resolve, which pathFor below never actually hits (every
    // edge has both a source and a target).
    return { box, side: sideFromPoint(box, anchorForOther(otherBox ?? box)) };
  }

  function pathFor(edge: DiagramEdge): { path: string; labelX: number; labelY: number; sourcePoint: Point; targetPoint: Point } | null {
    const sourceResolved = resolveEndpoint(edge.source, endpointBox(edge.target));
    const targetResolved = resolveEndpoint(edge.target, endpointBox(edge.source));
    if (!sourceResolved || !targetResolved) return null;
    const sourcePoint = getHandlePosition(sourceResolved.box, sourceResolved.side);
    const targetPoint = getHandlePosition(targetResolved.box, targetResolved.side);
    const result =
      edge.kind === 'straight'
        ? getStraightPath(sourcePoint, targetPoint)
        : edge.kind === 'curve'
          ? getBezierPath(sourcePoint, sourceResolved.side, targetPoint, targetResolved.side)
          : getSmoothStepPath(sourcePoint, sourceResolved.side, targetPoint, targetResolved.side);
    return { ...result, sourcePoint, targetPoint };
  }

  function renderHandles(target: { type: 'node' | 'frame'; id: string }, box: Box): ReactNode {
    const visible = (hover?.type === target.type && hover.id === target.id) || connect?.source.id === target.id;
    return SIDES.map((side) => {
      const point = getHandlePosition(box, side);
      return (
        <circle
          key={side}
          data-testid={`diagram-handle-${target.type}-${target.id}-${side}`}
          cx={point.x}
          cy={point.y}
          r={HANDLE_RADIUS / viewport.zoom}
          className="fill-(--acc) stroke-white"
          style={{ strokeWidth: 1 / viewport.zoom, opacity: visible ? 1 : 0, pointerEvents: visible ? 'all' : 'none', cursor: 'crosshair' }}
          onPointerDown={(event) => startConnect(target, side, event)}
          onPointerMove={handleConnectMove}
          onPointerUp={endConnect}
          onPointerCancel={endConnect}
        />
      );
    });
  }

  function renderNode(rawNode: DiagramNode): ReactNode {
    const box = renderedNodeBox(rawNode);
    const colors = COLOR_CLASSES[rawNode.color];
    const selected = isSelected(diagram.selection, 'node', rawNode.id);
    const strokeWidth = 1.5 / viewport.zoom;

    let shape: ReactNode;
    if (rawNode.kind === 'decision') {
      const points = [
        `${box.x + box.width / 2},${box.y}`,
        `${box.x + box.width},${box.y + box.height / 2}`,
        `${box.x + box.width / 2},${box.y + box.height}`,
        `${box.x},${box.y + box.height / 2}`,
      ].join(' ');
      shape = <polygon points={points} className={`${colors.fill} ${colors.stroke}`} style={{ strokeWidth }} />;
    } else if (rawNode.kind === 'terminal') {
      shape = (
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx={box.height / 2}
          className={`${colors.fill} ${colors.stroke}`}
          style={{ strokeWidth }}
        />
      );
    } else if (rawNode.kind === 'text') {
      shape = <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="transparent" />;
    } else {
      shape = (
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx={rawNode.kind === 'rounded' ? 12 : rawNode.kind === 'note' ? 2 : 0}
          className={`${colors.fill} ${colors.stroke}`}
          style={{ strokeWidth }}
        />
      );
    }

    const isEditing = editing?.id === rawNode.id;

    return (
      <g
        key={rawNode.id}
        data-testid={`diagram-node-${rawNode.id}`}
        data-diagram-kind={rawNode.kind}
        data-selected={selected || undefined}
        style={{
          pointerEvents: tool.kind === 'pointer' || tool.kind === 'connector' ? 'all' : 'none',
          cursor: tool.kind === 'connector' ? 'crosshair' : 'move',
        }}
        onPointerDown={(event) => handleNodePointerDown(rawNode, event)}
        onPointerMove={handleDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => beginEditing(rawNode)}
      >
        {shape}
        <foreignObject x={box.x} y={box.y} width={box.width} height={box.height} style={{ pointerEvents: isEditing ? 'all' : 'none' }}>
          {isEditing ? (
            <textarea
              // Entering inline edit mode is itself the user's request for
              // focus here.
              autoFocus
              data-testid={`diagram-text-input-${rawNode.id}`}
              value={editing.draft}
              maxLength={MAX_TEXT_LENGTH}
              className="size-full resize-none border-0 bg-transparent p-1 text-center text-[13px] text-white outline-none"
              onChange={(event) => setEditing({ id: rawNode.id, draft: event.target.value })}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  commitPendingEdit(true);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  commitPendingEdit(false);
                }
              }}
              onBlur={() => commitPendingEdit(true)}
            />
          ) : (
            <div className="flex size-full items-center justify-center overflow-hidden p-1.5 text-center text-[13px] break-words whitespace-pre-wrap text-white">
              {rawNode.text}
            </div>
          )}
        </foreignObject>
        {selected && (
          <>
            <rect
              x={box.x - 3}
              y={box.y - 3}
              width={box.width + 6}
              height={box.height + 6}
              fill="none"
              className="stroke-(--acc)"
              style={{ strokeWidth: 1.5 / viewport.zoom, strokeDasharray: `${4 / viewport.zoom} ${3 / viewport.zoom}` }}
            />
            {CORNERS.map(({ key, dx, dy }) => {
              const x = box.x + dx * box.width;
              const y = box.y + dy * box.height;
              const size = RESIZE_HANDLE_SIZE / viewport.zoom;
              return (
                <rect
                  key={key}
                  data-testid={`diagram-resize-${rawNode.id}-${key}`}
                  x={x - size / 2}
                  y={y - size / 2}
                  width={size}
                  height={size}
                  className="fill-(--acc) stroke-white"
                  style={{ strokeWidth: 1 / viewport.zoom, cursor: `${key}-resize`, pointerEvents: 'all' }}
                  onPointerDown={(event) => handleResizePointerDown(rawNode, key, event)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={endResize}
                  onPointerCancel={endResize}
                />
              );
            })}
          </>
        )}
        {renderHandles({ type: 'node', id: rawNode.id }, box)}
      </g>
    );
  }

  function renderEdge(edge: DiagramEdge): ReactNode {
    const resolved = pathFor(edge);
    if (!resolved) return null;
    const selected = isSelected(diagram.selection, 'edge', edge.id);

    return (
      <g key={edge.id} data-testid={`diagram-edge-${edge.id}`}>
        {/* A fat, invisible stroke carries the click/hover target so a thin
            connector line is still easy to select - the visible path below
            has pointer-events disabled so it never competes with this one. */}
        <path
          data-testid={`diagram-edge-hit-${edge.id}`}
          d={resolved.path}
          fill="none"
          stroke="transparent"
          strokeWidth={16 / viewport.zoom}
          style={{ pointerEvents: tool.kind === 'pointer' ? 'stroke' : 'none', cursor: 'pointer' }}
          onPointerDown={(event) => handleEdgePointerDown(edge, event)}
        />
        <path
          d={resolved.path}
          fill="none"
          className={selected ? 'stroke-(--acc)' : 'stroke-white/60'}
          style={{ strokeWidth: (selected ? 2 : 1.5) / viewport.zoom, pointerEvents: 'none' }}
          markerEnd={edge.arrow === 'end' || edge.arrow === 'both' ? 'url(#diagram-arrowhead)' : undefined}
          markerStart={edge.arrow === 'both' ? 'url(#diagram-arrowhead)' : undefined}
        />
        {edge.label && (
          <foreignObject x={resolved.labelX - 40} y={resolved.labelY - 12} width={80} height={24} style={{ pointerEvents: 'none' }}>
            <div className={`${CHIP} min-h-0 justify-center px-2 py-0.5 text-center font-mono text-[10.5px]`}>{edge.label}</div>
          </foreignObject>
        )}
      </g>
    );
  }

  const placementActive = tool.kind === 'shape';

  return (
    <svg
      ref={svgRef}
      data-testid="diagram-layer"
      aria-label="Diagram"
      width={0}
      height={0}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: placementActive ? 'auto' : 'none' }}
    >
      <defs>
        <marker
          id="diagram-arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className="fill-(--acc)" />
        </marker>
      </defs>

      {placementActive && (
        <rect
          data-testid="diagram-placement-surface"
          x={-100000}
          y={-100000}
          width={200000}
          height={200000}
          fill="transparent"
          style={{ pointerEvents: 'all', cursor: 'crosshair' }}
          onPointerDown={handlePlacePointerDown}
          onPointerMove={handlePlaceMove}
          onPointerUp={endPlace}
          onPointerCancel={endPlace}
        />
      )}

      {diagram.edges.map(renderEdge)}
      {diagram.nodes.map(renderNode)}
      {frames.map((frame) => (
        <g key={frame.id}>{renderHandles({ type: 'frame', id: frame.id }, frame)}</g>
      ))}

      {connect && (
        <path
          d={getStraightPath(connect.anchor, connect.current).path}
          fill="none"
          className="stroke-(--acc)"
          style={{ strokeWidth: 1.5 / viewport.zoom, strokeDasharray: `${4 / viewport.zoom} ${3 / viewport.zoom}`, pointerEvents: 'none' }}
        />
      )}
      {place && (place.start.x !== place.current.x || place.start.y !== place.current.y) && tool.kind === 'shape' && (
        <rect
          x={Math.min(place.start.x, place.current.x)}
          y={Math.min(place.start.y, place.current.y)}
          width={Math.abs(place.current.x - place.start.x)}
          height={Math.abs(place.current.y - place.start.y)}
          fill="none"
          className="stroke-(--acc)"
          style={{ strokeWidth: 1 / viewport.zoom, strokeDasharray: `${4 / viewport.zoom} ${3 / viewport.zoom}`, pointerEvents: 'none' }}
        />
      )}
    </svg>
  );
}
