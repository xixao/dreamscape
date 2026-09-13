'use client';

import { Frame, useEditor } from '@craftjs/core';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Screen } from '@/lib/files/repository';
import {
  ARTBOARD_MIN_HEIGHT,
  MAX_STAGE_WIDTH,
  MIN_STAGE_WIDTH,
  STAGE_PADDING,
  computeZoom,
} from '@/lib/stage';
import { cn } from '@/lib/utils';
import { ScreensStrip } from './screens-strip';
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
  const { width, height, zoom, setWidth, setZoom } = useStage();
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
        <div data-artboard data-testid="artboard-zoom" className="relative shrink-0" style={{ zoom }}>
          <div
            data-testid="artboard"
            className={cn(
              'theme-basic border border-line-strong bg-background font-sans text-foreground shadow-panel-lg',
              height != null && 'overflow-auto',
            )}
            style={height != null ? { width, height } : { width, minHeight: ARTBOARD_MIN_HEIGHT }}
          >
            <Frame key={currentScreenId} data={data} />
          </div>
          <ResizeGrip width={width} zoom={zoom} onResize={setWidth} />
        </div>
      </div>
    </div>
  );
}
