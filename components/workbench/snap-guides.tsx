'use client';

import type { SnapBox, SnapDistance, SnapGuide } from '@/lib/canvas/snap';
import { CHIP } from './chrome';

// Figma-style red (spec docs/superpowers/specs/2026-09-13-grid-snapping-
// alignment-design.md section 1: "red guide lines and distance labels"),
// matching the app's own --bad token (already the red used for the drag
// placeholder's error bar and the delete/danger treatment).
const GUIDE_COLOR = 'var(--bad)';

function lineFor(guide: SnapGuide): { x1: number; y1: number; x2: number; y2: number } {
  if (guide.kind === 'spacing') {
    // A spacing tick runs ALONG the axis being spaced, not across it: a
    // vertical-axis (x) gap draws as a horizontal tick, a horizontal-axis
    // (y) gap as a vertical one.
    return guide.orientation === 'vertical'
      ? { x1: guide.from, y1: guide.position, x2: guide.to, y2: guide.position }
      : { x1: guide.position, y1: guide.from, x2: guide.position, y2: guide.to };
  }
  // A grid/edge guide is a line perpendicular to its axis, spanning the
  // cross axis: vertical for an x snap, horizontal for a y snap.
  return guide.orientation === 'vertical'
    ? { x1: guide.position, y1: guide.from, x2: guide.position, y2: guide.to }
    : { x1: guide.from, y1: guide.position, x2: guide.to, y2: guide.position };
}

// Review fix wave item 4: this whole SVG lives inside canvas.tsx's own
// canvas-layer div, which already carries the ambient `scale(viewport.zoom)`
// CSS transform - so a foreignObject's real (CSS/DOM) content is scaled
// right along with the frames it floats above unless something here
// actively cancels that out. `translate(x,y) scale(1/zoom) translate(-x,-y)`
// pivots the counter-scale around the chip's own anchor point (x,y, already
// in canvas space): that point stays exactly where the ambient transform
// puts it, while the 40x22 box's SIZE and its -20/-11 offset from that
// point shrink or grow by 1/zoom first, so the ambient zoom scales them
// straight back to a constant on-screen size at any zoom level.
function Chip({ x, y, value, zoom }: { x: number; y: number; value: number; zoom: number }) {
  return (
    <foreignObject
      x={x - 20}
      y={y - 11}
      width={40}
      height={22}
      transform={`translate(${x} ${y}) scale(${1 / zoom}) translate(${-x} ${-y})`}
      style={{ overflow: 'visible', pointerEvents: 'none' }}
    >
      <div
        data-testid="snap-chip"
        className={`${CHIP} min-h-0 w-fit justify-center px-1.5 py-0.5 text-center font-mono text-[10.5px]`}
      >
        {Math.round(value)}
      </div>
    </foreignObject>
  );
}

// Where to anchor a nearest-neighbour distance chip (Alt-held) against the
// moving frame's own box - centred on the relevant edge.
function distanceChipPosition(box: SnapBox, side: SnapDistance['side']): { x: number; y: number } {
  switch (side) {
    case 'left':
      return { x: box.x, y: box.y + box.height / 2 };
    case 'right':
      return { x: box.x + box.width, y: box.y + box.height / 2 };
    case 'top':
      return { x: box.x + box.width / 2, y: box.y };
    case 'bottom':
      return { x: box.x + box.width / 2, y: box.y + box.height };
  }
}

/**
 * The red guide lines and mono distance chips drawn while a frame is being
 * dragged (spec docs/superpowers/specs/2026-09-13-grid-snapping-alignment-
 * design.md sections 2-3): rendered by components/workbench/canvas.tsx as a
 * sibling of the frames and DiagramLayer, inside the same canvas-space
 * transformed layer, so every coordinate here is already a plain canvas-
 * space number the same way DiagramLayer's own shapes are. `guides` are the
 * real snapped alignment/spacing lines from lib/canvas/snap.ts's
 * resolveSnap; `distances` are the Alt-held nearest-neighbour measurements,
 * anchored here against `movingFrame`'s own box since resolveSnap reports
 * only the side and the gap, not a position to draw at. Nothing is rendered
 * once the caller clears both arrays (canvas.tsx does this on drag end, via
 * FrameTitle's own onSnapGuides/onDragEnd - see frame-title.tsx).
 */
export function SnapGuides({
  guides,
  distances,
  movingFrame,
  zoom,
}: {
  guides: SnapGuide[];
  distances: SnapDistance[];
  movingFrame: SnapBox | null;
  // Review fix wave item 4: this SVG is drawn in canvas space, inside the
  // same ambient `scale(zoom)` layer as the frames themselves - both the
  // guide lines' strokeWidth and each chip's own counter-scale need the
  // current zoom to keep looking like a constant 1 screen px line / a
  // constant-size label at any zoom level, the same way Figma's own guides
  // never get thicker or thinner as you zoom.
  zoom: number;
}) {
  return (
    <svg
      data-testid="snap-guides"
      aria-hidden
      width={0}
      height={0}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      {guides.map((guide, index) => {
        const line = lineFor(guide);
        return (
          <line
            key={index}
            data-testid="snap-guide-line"
            data-kind={guide.kind}
            {...line}
            stroke={GUIDE_COLOR}
            strokeWidth={1 / zoom}
          />
        );
      })}
      {guides.map(
        (guide, index) =>
          guide.distance !== undefined && (
            <Chip
              key={`chip-${index}`}
              x={(lineFor(guide).x1 + lineFor(guide).x2) / 2}
              y={(lineFor(guide).y1 + lineFor(guide).y2) / 2}
              value={guide.distance}
              zoom={zoom}
            />
          ),
      )}
      {movingFrame &&
        distances.map((distance) => {
          const position = distanceChipPosition(movingFrame, distance.side);
          return <Chip key={distance.side} x={position.x} y={position.y} value={distance.value} zoom={zoom} />;
        })}
    </svg>
  );
}
