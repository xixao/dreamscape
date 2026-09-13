'use client';

import { Frame, useEditor, type EditorState } from '@craftjs/core';
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Screen } from '@/lib/files/repository';
import { toArtboardPoint, type Rect } from '@/lib/comments/geometry';
import { stackUnder, type LayerStackNode } from '@/lib/layer-stack';
import {
  ARTBOARD_MIN_HEIGHT,
  MAX_STAGE_WIDTH,
  MIN_STAGE_WIDTH,
  STAGE_PADDING,
  computeZoom,
} from '@/lib/stage';
import { cn } from '@/lib/utils';
import { CommentLayer, DEFAULT_STAGE_COMMENTS, type StageCommentsProps } from './comments/comment-layer';
import { ScreensStrip } from './screens-strip';
import { useStage } from './stage-context';

const ARTBOARD_SELECTOR = '[data-artboard]';

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

// The innermost node under `target` (deepest first, zone nodes excluded),
// read from Craft's own node DOM map - the same technique
// layer-stack-menu.tsx's flattenNodes/stackUnder pair uses to find the
// layer stack under a press point. Kept as the new pin's anchorNodeId so a
// real backend can use it later (spec section 2's "Pin anchoring" row);
// duplicated here (rather than imported) because layer-stack-menu.tsx's
// flattenNodes is a private, non-exported helper local to that file.
function innermostNodeId(nodes: EditorState['nodes'], target: Node): string | undefined {
  const flat: Record<string, LayerStackNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    flat[id] = {
      id,
      dom: node.dom,
      parent: node.data.parent,
      name: node.data.name,
      displayName: node.data.displayName || node.data.name,
    };
  }
  return stackUnder(flat, target)[0]?.id;
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
  comments = DEFAULT_STAGE_COMMENTS,
}: {
  data: string;
  screens: Screen[];
  currentScreenId: string;
  onSelectScreen: (id: string) => void;
  onAddScreen: () => void;
  onRenameScreen: (id: string, name: string) => void;
  onDuplicateScreen: (id: string) => void;
  onDeleteScreen: (id: string) => void;
  // Everything the comments placeholder needs (spec
  // docs/superpowers/specs/2026-09-12-folders-and-comments-design.md section 5);
  // optional so stage.test.tsx's existing calls (written before comments
  // existed) keep rendering an inert, empty comment layer unchanged.
  comments?: StageCommentsProps;
}) {
  const { width, zoom, setWidth, setZoom } = useStage();
  const { actions, query } = useEditor();
  const columnRef = useRef<HTMLDivElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);
  const [artboardRect, setArtboardRect] = useState<Rect | null>(null);

  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const update = () => {
      setZoom(computeZoom(column.clientWidth - STAGE_PADDING * 2, width));
      // Feeds CommentLayer's pin/popover positioning (toScreenPoint) - see
      // the comment on <CommentLayer> below for why that math uses real
      // screen coordinates instead of inheriting this element's own CSS zoom.
      const rect = artboardRef.current?.getBoundingClientRect();
      if (rect) setArtboardRect(rect);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(column);
    // The artboard can also move within the column without the column
    // itself resizing (the column scrolls whenever the artboard is taller
    // or wider than it) - re-measuring on scroll keeps pins from drifting
    // away from the artboard as the user scrolls it.
    column.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      column.removeEventListener('scroll', update);
    };
  }, [width, setZoom]);

  // Comment mode (spec section 5): a press on the artboard places a pin
  // instead of letting Craft select whatever is underneath. Craft's own
  // selection listens for native "mousedown" and "click", attached directly
  // to each block's DOM node in the bubble phase (confirmed against the
  // installed @craftjs/utils bundle's addCraftEventListener, which calls
  // `element.addEventListener(type, handler)` with no capture flag) - a
  // capture-phase handler up here on the column always runs first, and
  // stopping propagation there keeps the event from ever reaching that
  // deeper bubble listener at all. Both event types are guarded the same
  // way since they fire as two independent events for one physical click.
  function interceptForCommentMode(event: ReactMouseEvent<HTMLDivElement>): boolean {
    if (!comments.commentMode) return false;
    const target = event.target as HTMLElement;
    if (!target.closest(ARTBOARD_SELECTOR)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function handleArtboardMouseDownCapture(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!interceptForCommentMode(event)) return;
    const artboardEl = artboardRef.current;
    if (!artboardEl) return;
    // Measured fresh here rather than read from `artboardRect` state: state
    // is only as fresh as the last resize/scroll/zoom-change effect run, and
    // a click should always use the artboard's exact position right now.
    const rect = artboardEl.getBoundingClientRect();
    const point = toArtboardPoint(event.clientX, event.clientY, rect, zoom);
    const anchorNodeId = innermostNodeId(query.getState().nodes, event.target as Node);
    comments.onPlacePin(point.x, point.y, anchorNodeId);
  }

  return (
    <div
      ref={columnRef}
      data-testid="stage-column"
      className="flex min-w-0 flex-col overflow-auto rounded-xl bg-canvas [scrollbar-gutter:stable]"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-artboard]')) actions.selectNode();
      }}
      onMouseDownCapture={handleArtboardMouseDownCapture}
      onClickCapture={interceptForCommentMode}
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
          ref={artboardRef}
          data-artboard
          data-testid="artboard-zoom"
          className={cn('relative shrink-0', comments.commentMode && 'cursor-crosshair')}
          style={{ zoom }}
        >
          <div
            data-testid="artboard"
            className="theme-basic border border-line-strong bg-background font-sans text-foreground shadow-panel-lg"
            style={{ width, minHeight: ARTBOARD_MIN_HEIGHT }}
          >
            <Frame key={currentScreenId} data={data} />
          </div>
          <ResizeGrip width={width} zoom={zoom} onResize={setWidth} />
          {/*
            Colocated here in the zoom wrapper per spec, but positions
            everything it draws with fixed, real screen coordinates rather
            than by inheriting this element's `zoom` - see the comment on
            CommentLayer itself for why.
          */}
          <CommentLayer {...comments} zoom={zoom} artboardRect={artboardRect} />
        </div>
      </div>
    </div>
  );
}
