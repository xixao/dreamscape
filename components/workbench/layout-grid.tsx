'use client';

import type { LayoutGrid } from '@/lib/files/repository';

// Matches lib/files/validate.ts's own doc comment on the LayoutGrid type:
// the default a screen with none renders as - never written into storage
// just for being the default, the same convention ARTBOARD_MIN_HEIGHT and
// the device-less stageHeight/deviceName fallbacks already use.
export const DEFAULT_LAYOUT_GRID: LayoutGrid = { columns: 12, gutter: 24, margin: 32, visible: false };

export function resolveLayoutGrid(grid: LayoutGrid | undefined): LayoutGrid {
  return grid ?? DEFAULT_LAYOUT_GRID;
}

/**
 * A frame's layout grid overlay (spec docs/superpowers/specs/2026-09-13-
 * grid-snapping-alignment-design.md section 5), rendered inside the frame's
 * own iframe document: `components/workbench/stage.tsx` mounts this as a
 * sibling of the Craft `<Frame>` tree inside the same `<CanvasFrame>`, whose
 * `children` are portaled wholesale into that iframe's body
 * (canvas-frame.tsx) - so this component itself needs no portal or
 * `useCanvasDocument()` of its own, only a plain `fixed` overlay relative to
 * that document's own viewport. `pointer-events: none` and `aria-hidden` so
 * it never intercepts a click or gets announced; the accent colour at 10%
 * opacity, like Figma's own layout grid columns.
 */
export function LayoutGridOverlay({ grid }: { grid: LayoutGrid }) {
  if (!grid.visible) return null;

  return (
    <div
      data-testid="layout-grid"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 flex"
      style={{ paddingLeft: grid.margin, paddingRight: grid.margin, gap: grid.gutter }}
    >
      {Array.from({ length: grid.columns }, (_, index) => (
        <div key={index} className="h-full flex-1 bg-acc/10" />
      ))}
    </div>
  );
}
