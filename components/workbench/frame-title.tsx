'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Screen } from '@/lib/files/repository';
import { capturePointer } from '@/lib/dom';
import { cn } from '@/lib/utils';
import { NAME_MAX, RenameInput } from './screens-strip';

// Frame drag snaps to this many canvas px on each axis (spec docs/
// superpowers/specs/2026-09-12-infinite-canvas-design.md section 6).
const SNAP_PX = 8;

function snap(value: number): number {
  return Math.round(value / SNAP_PX) * SNAP_PX;
}

/**
 * A frame's title, drawn above its top-left corner in canvas space (spec
 * section 6): mono, `text-t2` when the frame is focused and `text-t4`
 * otherwise. Doubles as the drag handle that moves the whole frame (8px
 * snapping, pointer capture, deltas divided by the current zoom so a screen-
 * pixel drag always moves the frame by the same amount regardless of how
 * zoomed in or out the canvas is) and, on double-click, an inline rename
 * reusing the screens strip's own input and Enter/Escape rules.
 *
 * Rendered by components/workbench/canvas.tsx as a sibling of each frame's
 * Stage/FramePreview, inside that same absolutely-positioned (at the
 * screen's x/y) wrapper - `bottom-full` here stacks it directly above that
 * wrapper's own box, so this component itself never needs to know the
 * frame's position, only its zoom (for the drag) and its own screen data.
 */
export function FrameTitle({
  screen,
  focused,
  zoom,
  onRename,
  onMove,
}: {
  screen: Screen;
  focused: boolean;
  zoom: number;
  onRename: (name: string) => void;
  onMove: (position: { x: number; y: number }) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The drag's own starting point (both in screen px, for computing deltas,
  // and the frame's x/y at that moment, since every subsequent onMove is
  // computed from that same anchor, not accumulated move-to-move deltas -
  // the same "start plus total delta" approach the resize handles already
  // use, avoiding any drift from repeatedly rounding a running total).
  const dragRef = useRef<{ pointerId: number; startClientX: number; startClientY: number; startX: number; startY: number } | null>(
    null,
  );

  function commitRename(raw: string): void {
    setRenaming(false);
    const trimmed = raw.trim().slice(0, NAME_MAX);
    if (!trimmed || trimmed === screen.name) return;
    onRename(trimmed);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    capturePointer(event.currentTarget, event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: screen.x ?? 0,
      startY: screen.y ?? 0,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startClientX) / zoom;
    const dy = (event.clientY - drag.startClientY) / zoom;
    onMove({ x: snap(drag.startX + dx), y: snap(drag.startY + dy) });
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  if (renaming) {
    return (
      <div className="absolute bottom-full left-0 mb-1">
        <RenameInput screen={screen} onCommit={commitRename} onCancel={() => setRenaming(false)} inputRef={inputRef} />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        'absolute bottom-full left-0 mb-1 cursor-grab touch-none rounded-sm px-0.5 font-mono text-[11px] select-none active:cursor-grabbing',
        focused ? 'text-t2' : 'text-t4',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => setRenaming(true)}
    >
      {screen.name}
    </button>
  );
}
