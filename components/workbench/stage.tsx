'use client';

import { Frame, useEditor } from '@craftjs/core';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Screen } from '@/lib/files/repository';
import { ARTBOARD_MIN_HEIGHT, STAGE_PADDING, computeZoom } from '@/lib/stage';
import { MAX_STAGE_HEIGHT, MAX_STAGE_WIDTH, MIN_STAGE_HEIGHT, MIN_STAGE_WIDTH } from '@/lib/stage/size';
import { cn } from '@/lib/utils';
import { CanvasFrame } from './canvas-frame';
import { ScreensStrip } from './screens-strip';
import { useStage } from './stage-context';

// Every arrow-key press on any handle moves that axis by this many unscaled
// content pixels (spec docs/superpowers/specs/2026-09-12-responsive-canvas-
// design.md #3).
const ARROW_STEP = 8;

type HandleAxis = 'width' | 'height' | 'corner';

const HANDLE_META: Record<
  HandleAxis,
  { label: string; orientation: 'horizontal' | 'vertical'; className: string; barClassName: string }
> = {
  width: {
    label: 'Resize width',
    orientation: 'vertical',
    className: 'top-0 -right-2 h-full w-4 cursor-col-resize items-center justify-center',
    barClassName: 'h-10 w-1 rounded-full',
  },
  height: {
    label: 'Resize height',
    orientation: 'horizontal',
    className: 'left-0 -bottom-2 w-full h-4 cursor-row-resize items-center justify-center',
    barClassName: 'h-1 w-10 rounded-full',
  },
  corner: {
    label: 'Resize frame',
    orientation: 'vertical',
    className: '-right-1.5 -bottom-1.5 size-3 cursor-nwse-resize items-center justify-center',
    barClassName: 'size-2 rounded-full',
  },
};

/**
 * One Figma-style resize handle - the right edge (width only), the bottom
 * edge (height only) or the bottom-right corner (both). All three share the
 * same pointer-capture drag, keyboard-arrow stepping and live readout;
 * `axis` decides which value(s) they read, report and step.
 *
 * The width axis reports through `onWidthChange` (wired to the context's
 * `setWidth`, matching the pre-existing single-grip behaviour and its
 * `onWidthChange` callback all the way to workbench.tsx). The height and
 * corner axes report through `onResize`, always with a COMPLETE
 * `{ width, height }` pair - not two separate single-value callbacks -
 * because a corner drag changes both from the same pointer delta in the
 * same event; calling two independent setters back to back would have the
 * second one overwrite the first with the axis it doesn't own, since each
 * closes over the render's pre-drag value for whichever field it is not
 * updating itself.
 */
function ResizeHandle({
  axis,
  width,
  height,
  zoom,
  onWidthChange,
  onResize,
  onDoubleClick,
}: {
  axis: HandleAxis;
  width: number;
  // The current effective height in unscaled px - always a concrete number,
  // even when the frame's own height is "auto" (Stage passes the measured
  // content height from CanvasFrame's onContentHeightChange in that case),
  // so a height/corner drag or arrow-key press always has a real value to
  // start from.
  height: number;
  zoom: number;
  onWidthChange?: (width: number) => void;
  onResize?: (next: { width: number; height: number }) => void;
  onDoubleClick?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const meta = HANDLE_META[axis];
  const affectsWidth = axis === 'width' || axis === 'corner';
  const affectsHeight = axis === 'height' || axis === 'corner';

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    start.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  function applyDelta(dx: number, dy: number) {
    if (!start.current) return;
    const nextWidth = affectsWidth ? start.current.width + dx / zoom : start.current.width;
    const nextHeight = affectsHeight ? start.current.height + dy / zoom : start.current.height;
    if (axis === 'width') onWidthChange?.(nextWidth);
    else onResize?.({ width: nextWidth, height: nextHeight });
  }

  const valueNow = axis === 'height' ? height : width;
  const valueMin = axis === 'height' ? MIN_STAGE_HEIGHT : MIN_STAGE_WIDTH;
  const valueMax = axis === 'height' ? MAX_STAGE_HEIGHT : MAX_STAGE_WIDTH;

  return (
    <div
      role="separator"
      aria-orientation={meta.orientation}
      aria-label={meta.label}
      aria-valuenow={Math.round(valueNow)}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuetext={`${Math.round(width)} × ${Math.round(height)}`}
      tabIndex={0}
      data-testid={`resize-handle-${axis}`}
      className={cn('absolute flex touch-none select-none', meta.className)}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, y: event.clientY, width, height };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        applyDelta(event.clientX - start.current.x, event.clientY - start.current.y);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
          return;
        }
        event.preventDefault();
        const widthStep = event.key === 'ArrowRight' ? ARROW_STEP : event.key === 'ArrowLeft' ? -ARROW_STEP : 0;
        const heightStep = event.key === 'ArrowDown' ? ARROW_STEP : event.key === 'ArrowUp' ? -ARROW_STEP : 0;
        if (axis === 'width' && widthStep !== 0) onWidthChange?.(width + widthStep);
        else if (axis === 'height' && heightStep !== 0) onResize?.({ width, height: height + heightStep });
        else if (axis === 'corner' && (widthStep !== 0 || heightStep !== 0)) {
          onResize?.({ width: width + widthStep, height: height + heightStep });
        }
      }}
    >
      <div className={cn(meta.barClassName, dragging ? 'bg-acc' : 'bg-border')} />
      {dragging && (
        <span
          data-testid="resize-readout"
          className="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-white"
        >
          {Math.round(width)} × {Math.round(height)}
        </span>
      )}
    </div>
  );
}

export function Stage({
  data,
  screens,
  currentScreenId,
  onSelectScreen,
  onAddScreen,
  onRenameScreen,
  onDuplicateScreen,
  onDeleteScreen,
}: {
  data: string;
  screens: Screen[];
  currentScreenId: string;
  onSelectScreen: (id: string) => void;
  onAddScreen: () => void;
  onRenameScreen: (id: string, name: string) => void;
  onDuplicateScreen: (id: string) => void;
  onDeleteScreen: (id: string) => void;
}) {
  const { width, height, zoom, setWidth, setSize, setZoom } = useStage();
  const { actions } = useEditor();
  const columnRef = useRef<HTMLDivElement>(null);
  // The frame's real, current unscaled height, whether that comes from a
  // manual/device height or - when height is "auto" - from CanvasFrame's own
  // content measurement. Always a concrete number so the height/corner
  // handles and the wrapper's own reserved layout space never need to guess.
  const [contentHeight, setContentHeight] = useState(ARTBOARD_MIN_HEIGHT);
  const effectiveHeight = height ?? contentHeight;

  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const update = () => setZoom(computeZoom(column.clientWidth - STAGE_PADDING * 2, width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(column);
    return () => observer.disconnect();
  }, [width, setZoom]);

  return (
    <div
      ref={columnRef}
      data-testid="stage-column"
      className="flex min-w-0 flex-col overflow-auto rounded-xl bg-canvas [scrollbar-gutter:stable]"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-artboard]')) actions.selectNode();
      }}
    >
      <div className="flex shrink-0 items-center border-b border-line-soft bg-canvas px-3 py-2">
        <ScreensStrip
          screens={screens}
          currentScreenId={currentScreenId}
          onSelect={onSelectScreen}
          onAdd={onAddScreen}
          onRename={onRenameScreen}
          onDuplicate={onDuplicateScreen}
          onDelete={onDeleteScreen}
        />
      </div>
      <div className="flex flex-1 justify-center" style={{ padding: STAGE_PADDING }}>
        <div
          data-artboard
          data-testid="artboard"
          className="theme-basic relative shrink-0 overflow-hidden border border-line-strong bg-background shadow-panel-lg"
          style={{ width: width * zoom, height: effectiveHeight * zoom }}
        >
          <CanvasFrame width={width} height={height} zoom={zoom} onContentHeightChange={setContentHeight}>
            <Frame key={currentScreenId} data={data} />
          </CanvasFrame>
          <ResizeHandle axis="width" width={width} height={effectiveHeight} zoom={zoom} onWidthChange={setWidth} />
          <ResizeHandle
            axis="height"
            width={width}
            height={effectiveHeight}
            zoom={zoom}
            onResize={setSize}
            onDoubleClick={() => setSize({ width, height: null })}
          />
          <ResizeHandle axis="corner" width={width} height={effectiveHeight} zoom={zoom} onResize={setSize} />
        </div>
      </div>
    </div>
  );
}
