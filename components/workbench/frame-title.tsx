'use client';
import { useExploreVariations } from './variations/context';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { STAGE_PRESETS, STAGE_PRESET_ORDER } from '@/lib/stage';
import type { Screen } from '@/lib/files/repository';
import { resolveSnap, type SnapBox, type SnapDistance, type SnapGuide } from '@/lib/canvas/snap';
import { capturePointer } from '@/lib/dom';
import { isOverlay, overlayBadgeLabel } from '@/lib/files/screens';
import { cn } from '@/lib/utils';
import { NAME_MAX, RenameInput } from './rename-input';

export interface FrameSnapResult {
  guides: SnapGuide[];
  distances: SnapDistance[];
}

const NO_SNAP_RESULT: FrameSnapResult = { guides: [], distances: [] };

/**
 * A frame's title, drawn above its top-left corner in canvas space (spec
 * docs/superpowers/specs/2026-09-12-infinite-canvas-design.md section 6):
 * a constant-size chrome tab with a viewport resize menu.
 * Doubles as the drag handle that moves the whole frame - pointer capture,
 * deltas divided by the current zoom so a screen-pixel drag always moves the
 * frame by the same amount regardless of how zoomed in or out the canvas
 * is, and the position resolved through lib/canvas/snap.ts's resolveSnap
 * against `otherFrames` (spec docs/superpowers/specs/2026-09-13-grid-
 * snapping-alignment-design.md section 3): Cmd/Ctrl held disables snapping,
 * Alt held reports distances to the nearest neighbours even without a snap.
 * `onSnapGuides` fires on every move with the current guides/distances, and
 * again with both empty right before `onDragEnd` - so a caller drawing them
 * in the canvas overlay never has to guess when to clear them - and, on
 * double-click, an inline rename reusing rename-input.tsx's shared input and
 * Enter/Escape rules. An overlay frame (spec docs/superpowers/specs/2026-
 * 09-13-overlay-frames-design.md section 5) gets a trailing mono badge
 * naming its presentation ("Dialog", "Sheet · Right", "Toast") - hidden,
 * like the name itself, while renaming.
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
  height,
  onRename,
  onMove,
  otherFrames = [],
  onSnapGuides,
  onDragEnd,
  onShiftSelect,
  onSelect,
  surface = false,
  onEnterContents,
  onResize,
}: {
  onResize?: (width: number) => void;
  surface?: boolean;
  onEnterContents?: () => void;
  screen: Screen;
  focused: boolean;
  zoom: number;
  // The frame's real, current height (review re-review R1) - the caller
  // (canvas.tsx) always resolves this through lib/canvas/viewport.ts's
  // frameRect/snapBoxFor (screen.stageHeight, else a fed measured height,
  // else ARTBOARD_MIN_HEIGHT as a last resort), the same box `otherFrames`
  // below is already built from. Required, not defaulted here: computing
  // that fallback chain is frameRect's one job, not this component's - a
  // second, ad hoc `?? ARTBOARD_MIN_HEIGHT` here previously left the
  // DRAGGED frame's own box a step behind every other frame's for an
  // auto-height screen taller than the ARTBOARD_MIN_HEIGHT estimate,
  // corrupting its own bottom/middle snaps and Alt distances.
  height: number;
  onRename: (name: string) => void;
  // `delta` is the drag's total movement so far (canvas px, already
  // snapped) from this frame's own position at pointerdown - how
  // components/workbench/canvas.tsx fans a multi-frame drag out to every
  // other selected frame (spec section 3: "dragging any selected title
  // moves all selected frames together").
  onMove: (position: { x: number; y: number }, delta: { dx: number; dy: number }) => void;
  // Every OTHER frame to snap against - the caller (canvas.tsx) excludes
  // this frame and, for a multi-select drag, every co-selected frame too
  // (a selection does not snap against its own members).
  otherFrames?: SnapBox[];
  onSnapGuides?: (result: FrameSnapResult) => void;
  onDragEnd?: () => void;
  // Shift+click (spec docs/superpowers/specs/2026-09-13-grid-snapping-
  // alignment-design.md section 3: "Shift+click a frame title adds to the
  // selection") - a pure selection toggle, not a drag: pointerdown returns
  // immediately below without starting the usual drag tracking, so a
  // Shift+click never also moves the frame.
  onShiftSelect?: () => void;
  onSelect?: () => void;
}) {
  const explore = useExploreVariations();
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
    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.shiftKey) {
      onShiftSelect?.();
      return;
    }
    onSelect?.();
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
    const moving: SnapBox = {
      id: screen.id,
      x: drag.startX + dx,
      y: drag.startY + dy,
      width: screen.stageWidth,
      height,
    };
    const resolved = resolveSnap(moving, otherFrames, zoom, {
      disabled: event.metaKey || event.ctrlKey,
      showDistances: event.altKey,
    });
    onSnapGuides?.({ guides: resolved.guides, distances: resolved.distances });
    onMove(resolved.position, {
      dx: resolved.position.x - drag.startX,
      dy: resolved.position.y - drag.startY,
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    onSnapGuides?.(NO_SNAP_RESULT);
    onDragEnd?.();
  }

  if (surface) return <button type="button" aria-label={`Move selected frame ${screen.name}`}
    className="absolute inset-0 z-10 cursor-grab touch-none bg-transparent active:cursor-grabbing"
    onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
    onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
    onDoubleClick={event => { event.stopPropagation(); onEnterContents?.(); }}
  />;

  if (renaming) {
    return (
      <div className="absolute bottom-full left-0 mb-2" style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'bottom left' }}>
        <RenameInput screen={screen} onCommit={commitRename} onCancel={() => setRenaming(false)} inputRef={inputRef} />
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 flex items-center gap-1 rounded-md border border-line-soft bg-card p-1 text-foreground shadow-sm"
      style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'bottom left' }}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <button
      type="button"
      data-frame-title={screen.id}
      className={cn(
        'max-w-64 truncate cursor-grab touch-none rounded-sm px-2 py-1 text-xs font-medium select-none active:cursor-grabbing',
        focused ? 'text-t1' : 'text-t2',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={event => { event.stopPropagation(); if (!event.shiftKey) onSelect?.(); }}
      onDoubleClick={() => setRenaming(true)}
    >
      {screen.name}
      {isOverlay(screen) && <span className="ml-1 text-t4">{overlayBadgeLabel(screen.presentation)}</span>}
    </button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Frame options for ${screen.name}`} className="rounded p-1 hover:bg-muted" onPointerDown={event => event.stopPropagation()}>
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48" onPointerDown={event => event.stopPropagation()}>
        {explore && <DropdownMenuItem onSelect={() => explore(screen.id)}>Explore variations…</DropdownMenuItem>}
        {STAGE_PRESET_ORDER.map(preset => <DropdownMenuItem key={preset} onSelect={() => onResize?.(STAGE_PRESETS[preset])}>
          <span>{preset[0].toUpperCase() + preset.slice(1)}</span><span className="ml-auto text-muted-foreground">{STAGE_PRESETS[preset]} px</span>
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}
