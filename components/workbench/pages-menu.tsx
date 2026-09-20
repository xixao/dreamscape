'use client';
import { useExploreVariations } from './variations/context';

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
import type { Page, Screen } from '@/lib/files/repository';
import { cn } from '@/lib/utils';
import { CHIP, CHIP_INPUT, DANGER_GHOST } from './chrome';

// Same cap as a screen's own name (screens-strip.tsx's NAME_MAX) - both
// come from validatePages/validateScreens' shared 1..80 rule
// (lib/files/validate.ts).
const PAGE_NAME_MAX = 80;

/**
 * The top bar's page chip and pages menu (spec docs/superpowers/specs/
 * 2026-09-12-pages-design.md section 3): the chip shows the current page's
 * own name and opens a menu listing every page (current one checked) plus,
 * below a separator, Rename/Duplicate page/Delete page/Move up/Move down -
 * all acting on whichever page is CURRENT, not a per-row action the way a
 * screen's own chevron menu in screens-strip.tsx works (there is exactly
 * one page a menu opened from its own chip could plausibly act on) - then
 * New page at the bottom. Switching pages, and every page CRUD action, is
 * funnelled straight through to whoever owns page state (workbench.tsx).
 */
export function PagesMenu({
  pages,
  currentPageId,
  screens,
  onSwitch,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
}: {
  pages: Page[];
  currentPageId: string;
  // Only read to count how many screens a Delete confirmation would remove
  // (spec: "confirm dialog naming how many screens it removes").
  screens: Screen[];
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
}) {
  // Renaming swaps the CHIP TRIGGER itself for an input (not a row inside
  // the dropdown): Escape must cancel just the rename, but Radix's own
  // DropdownMenuContent already closes itself on Escape everywhere inside
  // it, including inside a plain child input's own keydown handler
  // (calling preventDefault there does not stop Radix's separate dismiss
  // listener) - putting the input outside the menu entirely, the same
  // place screens-strip.tsx's own Rename ends up (its menu closes first,
  // then the tab's own label becomes the input), sidesteps that fight
  // rather than trying to out-race it.
  const explore = useExploreVariations();
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Page | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const currentIndex = pages.findIndex((page) => page.id === currentPageId);
  const currentPage = pages[currentIndex] ?? pages[0];
  const deleteScreenCount = deleteTarget
    ? screens.filter((screen) => screen.pageId === deleteTarget.id).length
    : 0;

  function commitRename(raw: string): void {
    setRenaming(false);
    const trimmed = raw.trim().slice(0, PAGE_NAME_MAX);
    if (!trimmed || trimmed === currentPage.name) return;
    onRename(currentPage.id, trimmed);
  }

  if (renaming) {
    return (
      <div className={cn(CHIP, 'w-40')}>
        <Input
          ref={renameInputRef}
          autoFocus
          aria-label="Page name"
          defaultValue={currentPage.name}
          maxLength={PAGE_NAME_MAX}
          className={CHIP_INPUT}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitRename(event.currentTarget.value);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setRenaming(false);
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
            aria-label="Pages"
            aria-haspopup="menu"
            className={cn(CHIP, 'gap-1.5 px-2 text-[12.5px] font-medium text-foreground')}
          >
            <Layers2 className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="max-w-36 truncate">{currentPage?.name}</span>
            <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          // Same trick as screens-strip.tsx's own Rename item, and for the
          // same reason: Radix returns focus to the trigger the instant it
          // finishes closing, which would steal it right back from the
          // input this Rename selection is about to mount - focus+select
          // it directly once Radix has fully finished closing instead.
          onCloseAutoFocus={(event) => {
            if (!renameInputRef.current) return;
            event.preventDefault();
            renameInputRef.current.focus();
            renameInputRef.current.select();
          }}
        >
          {pages.map((page) => (
            <DropdownMenuItem key={page.id} onSelect={() => onSwitch(page.id)}>
              <span className="flex-1 truncate">{page.kind==='variations'?'Variations · ':''}{page.name}</span>
              {page.id === currentPageId && (
                <Check data-testid="page-check" className="size-3.5 shrink-0" aria-hidden />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicate(currentPageId)}>Duplicate page</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={pages.length <= 1}
            onSelect={() => setDeleteTarget(currentPage)}
          >
            Delete page
          </DropdownMenuItem>
          <DropdownMenuItem disabled={currentIndex <= 0} onSelect={() => onMove(currentPageId, 'up')}>
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={currentIndex === -1 || currentIndex >= pages.length - 1}
            onSelect={() => onMove(currentPageId, 'down')}
          >
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onAdd}>New page</DropdownMenuItem>
          {explore&&<DropdownMenuItem onSelect={()=>explore('')}>New Variations Page</DropdownMenuItem>}
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
              This removes {deleteScreenCount} {deleteScreenCount === 1 ? 'screen' : 'screens'} for everyone. Undo
              will not bring it back.
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
