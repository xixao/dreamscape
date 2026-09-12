'use client';

import { Frame, useEditor } from '@craftjs/core';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ARTBOARD_MIN_HEIGHT,
  MAX_STAGE_WIDTH,
  MIN_STAGE_WIDTH,
  STAGE_PADDING,
  computeZoom,
} from '@/lib/stage';
import { cn } from '@/lib/utils';
import { useStage } from './stage-context';

function ResizeGrip({
  width,
  zoom,
  onResize,
}: {
  width: number;
  zoom: number;
  onResize: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    start.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the frame"
      aria-valuenow={width}
      aria-valuemin={MIN_STAGE_WIDTH}
      aria-valuemax={MAX_STAGE_WIDTH}
      tabIndex={0}
      className="absolute top-0 -right-4 flex h-full w-4 cursor-col-resize touch-none items-center justify-center select-none"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, width };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onResize(start.current.width + (event.clientX - start.current.x) / zoom);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 100 : 10;
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onResize(width + step);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onResize(width - step);
        }
      }}
    >
      <div className={cn('h-10 w-1 rounded-full', dragging ? 'bg-acc' : 'bg-border')} />
    </div>
  );
}

export function Stage({ data }: { data: string }) {
  const { width, zoom, setWidth, setZoom } = useStage();
  const { actions } = useEditor();
  const columnRef = useRef<HTMLDivElement>(null);

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
      className="min-w-0 overflow-auto rounded-xl bg-canvas [scrollbar-gutter:stable]"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-artboard]')) actions.selectNode();
      }}
    >
      <div className="flex justify-center" style={{ padding: STAGE_PADDING }}>
        <div data-artboard data-testid="artboard-zoom" className="relative shrink-0" style={{ zoom }}>
          <div
            data-testid="artboard"
            className="theme-basic border border-line-strong bg-background font-sans text-foreground shadow-panel-lg"
            style={{ width, minHeight: ARTBOARD_MIN_HEIGHT }}
          >
            <Frame data={data} />
          </div>
          <ResizeGrip width={width} zoom={zoom} onResize={setWidth} />
        </div>
      </div>
    </div>
  );
}
