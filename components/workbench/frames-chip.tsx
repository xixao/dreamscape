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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { OverlayPresentationType, Page, Screen } from '@/lib/files/repository';
import { isOverlay, overlayBadgeLabel, wouldStrandPage } from '@/lib/files/screens';
import { cn } from '@/lib/utils';
import { CHIP, DANGER_GHOST, MENU_HINT } from './chrome';
import { NAME_MAX, RenameInput } from './rename-input';

// Overlay frames phase 2 review, finding 1: a page must always keep at
// least one plain screen once it has an overlay on it - Present has
// nowhere sensible to land otherwise (spec docs/superpowers/specs/2026-09-
// 13-overlay-frames-design.md). Shared by Delete and Move to page below,
// since moving a screen away strands its origin page exactly the way
// deleting it would; wouldStrandPage itself (lib/files/screens.ts) is the
// one shared check this UI and workbench.tsx's own deleteScreen/
// moveScreenToPage data-layer guards both call, so they can never disagree.
const NEEDS_SCREEN_TOOLTIP = 'A page needs at least one screen';

/**
 * The top bar's frame chip and frames menu (spec docs/superpowers/specs/
 * 2026-09-13-frames-chip-design.md section 1): the chip shows the focused
 * frame's name and the page's frame count in mono ("Login · 9"). The menu
 * lists the current page's frames in canvas order, focused one marked with
 * a check; clicking a row focuses that frame and zooms to it, closing the
 * menu, while hovering a row (or pressing Right/Enter/Space with it
 * focused - a Radix DropdownMenuSubTrigger's own open contract) reveals
 * that SPECIFIC frame's own actions - Rename (an inline field swapped in
 * for the row itself, dropdown staying open around it; Enter commits,
 * Escape cancels; components/workbench/rename-input.tsx, shared with
 * frame-title.tsx's double-click rename), Duplicate, Move to page and
 * Delete (confirms when the frame has content) - reachable for ANY row,
 * not only the focused one, the same per-row reach the deleted
 * screens-strip.tsx's own chevron menu offered. "New frame" sits at the
 * end, outside every row. Keyboard navigation and type-ahead are Radix
 * dropdown/submenu defaults.
 */
export function FramesChip({
  frames,
  currentFrameId,
  pages,
  onSwitch,
  onAdd,
  onAddOverlay,
  onRename,
  onDuplicate,
  onDelete,
  onMoveToPage,
  onZoomToFrame,
}: {
  frames: Screen[];
  currentFrameId: string;
  pages?: Page[];
  onSwitch: (id: string) => void;
  onAdd: () => void;
  // Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
  // design.md section 5, phase 2): the "New overlay" submenu's three items
  // all call this with their own type, leaving side/position to
  // createOverlayScreen's own defaults (right sheet, bottom-right toast) -
  // same as onAdd leaving every new screen's size to addScreen itself.
  onAddOverlay: (type: OverlayPresentationType) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveToPage?: (id: string, pageId: string) => void;
  onZoomToFrame: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Screen | null>(null);
  // At most one RenameInput is ever mounted (renaming is a single id) - one
  // shared ref covers whichever row is currently being renamed, the same
  // "one ref, whichever item is active" shape frame-title.tsx's own use of
  // this component already has.
  const renameInputRef = useRef<HTMLInputElement>(null);

  const currentFrame = frames.find((frame) => frame.id === currentFrameId);
  const frameCount = frames.length;

  function commitRename(target: Screen, raw: string): void {
    setRenaming(null);
    const trimmed = raw.trim().slice(0, NAME_MAX);
    if (!trimmed || trimmed === target.name) return;
    onRename(target.id, trimmed);
  }

  function handleSelectFrame(id: string): void {
    onSwitch(id);
    onZoomToFrame(id);
    setOpen(false);
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
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
        <DropdownMenuContent align="start">
          {frames.map((frame) =>
            renaming === frame.id ? (
              <div key={frame.id} className="px-1.5 py-1">
                <RenameInput
                  screen={frame}
                  onCommit={(name) => commitRename(frame, name)}
                  onCancel={() => setRenaming(null)}
                  inputRef={renameInputRef}
                />
              </div>
            ) : (
              <DropdownMenuSub key={frame.id}>
                <DropdownMenuSubTrigger
                  onClick={(event) => {
                    // A plain click on the row itself still just focuses
                    // and zooms to it (spec: "clicking a frame focuses it
                    // and zooms to it") rather than opening this row's own
                    // submenu, which is Radix's own default for a click on
                    // a SubTrigger - preventDefault short-circuits that
                    // default (see @radix-ui/react-menu's MenuSubTrigger:
                    // its onClick bails out once defaultPrevented), while
                    // leaving hover and ArrowRight/Enter/Space, which don't
                    // go through this handler, free to open it normally.
                    event.preventDefault();
                    handleSelectFrame(frame.id);
                  }}
                >
                  <span className="flex-1 truncate">{frame.name}</span>
                  {isOverlay(frame) && <span className={cn(MENU_HINT, 'shrink-0')}>{overlayBadgeLabel(frame.presentation)}</span>}
                  {frame.id === currentFrameId && (
                    <Check data-testid="frame-check" className="size-3.5 shrink-0" aria-hidden />
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      // Keeps the whole menu tree open (Radix's own default
                      // on selecting any item is to close it via
                      // rootContext.onClose(), unless prevented here) so
                      // the row above swaps to its RenameInput in place,
                      // rather than this closing everything and having
                      // nowhere left to show the field.
                      event.preventDefault();
                      setRenaming(frame.id);
                    }}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onDuplicate(frame.id)}>Duplicate</DropdownMenuItem>
                  {pages && pages.length > 1 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        disabled={wouldStrandPage(frame, frames)}
                        title={wouldStrandPage(frame, frames) ? NEEDS_SCREEN_TOOLTIP : undefined}
                      >
                        Move to page
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {pages
                          .filter((page) => page.id !== frame.pageId)
                          .map((page) => (
                            <DropdownMenuItem key={page.id} onSelect={() => onMoveToPage?.(frame.id, page.id)}>
                              {page.name}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={wouldStrandPage(frame, frames)}
                    title={wouldStrandPage(frame, frames) ? NEEDS_SCREEN_TOOLTIP : undefined}
                    onSelect={() => setDeleteTarget(frame)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ),
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onAdd}>New frame</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>New overlay</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => onAddOverlay('dialog')}>Dialog</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAddOverlay('sheet')}>Sheet</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAddOverlay('toast')}>Toast</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
