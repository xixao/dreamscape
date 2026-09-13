'use client';

import { useRef, useState } from 'react';
import { Check, ChevronDown, Layers2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { Screen } from '@/lib/files/repository';
import { cn } from '@/lib/utils';
import { CHIP, CHIP_INPUT, DANGER_GHOST } from './chrome';

// Same cap as a page's own name - both come from validateScreens' shared 1..80 rule
// (lib/files/validate.ts).
const FRAME_NAME_MAX = 80;

/**
 * The top bar's frame chip and frames menu (spec docs/superpowers/specs/
 * 2026-09-13-frames-chip-design.md section 1): the chip shows the focused
 * frame's name and the page's frame count in mono ("Login · 9"), opening a
 * menu that lists the current page's frames in canvas order with the focused
 * one marked, and per-row actions Rename (inline field, Enter commits, Escape
 * cancels), Duplicate, Delete (confirms when the frame has content), and a
 * "New frame" item at the end. Clicking a row focuses that frame and zooms
 * to it. Keyboard navigation via Radix dropdown arrows and type-ahead.
 */
export function FramesChip({
  frames,
  currentFrameId,
  onSwitch,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onZoomToFrame,
}: {
  frames: Screen[];
  currentFrameId: string;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onZoomToFrame: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Screen | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const currentFrame = frames.find((frame) => frame.id === currentFrameId);
  const frameCount = frames.length;

  function commitRename(target: Screen, raw: string): void {
    setRenaming(null);
    const trimmed = raw.trim().slice(0, FRAME_NAME_MAX);
    if (!trimmed || trimmed === target.name) return;
    onRename(target.id, trimmed);
  }

  function handleSelectFrame(id: string): void {
    onSwitch(id);
    onZoomToFrame(id);
  }

  if (renaming === currentFrameId) {
    return (
      <div className={cn(CHIP, 'w-40')}>
        <Input
          ref={renameInputRef}
          autoFocus
          aria-label="Frame name"
          defaultValue={currentFrame?.name ?? ''}
          maxLength={FRAME_NAME_MAX}
          className={CHIP_INPUT}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (currentFrame) commitRename(currentFrame, event.currentTarget.value);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setRenaming(null);
            }
          }}
        />
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Frames"
            aria-haspopup="menu"
            className={cn(CHIP, 'gap-1.5 px-2 text-[12.5px] font-medium text-foreground')}
          >
            <Layers2 className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="font-mono text-[11px]">
              {currentFrame?.name ?? '—'} · {frameCount}
            </span>
            <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          onCloseAutoFocus={(event) => {
            if (!renameInputRef.current) return;
            event.preventDefault();
            renameInputRef.current.focus();
            renameInputRef.current.select();
          }}
        >
          {frames.map((frame) => (
            <DropdownMenuItem key={frame.id} onSelect={() => handleSelectFrame(frame.id)}>
              <span className="flex-1 truncate">{frame.name}</span>
              {frame.id === currentFrameId && (
                <Check data-testid="frame-check" className="size-3.5 shrink-0" aria-hidden />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setRenaming(currentFrameId)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicate(currentFrameId)}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={frames.length <= 1}
            onSelect={() => setDeleteTarget(currentFrame ?? null)}
          >
            Delete
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onAdd}>New frame</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the frame for everyone. Undo will not bring it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="ghost"
              className={DANGER_GHOST}
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
