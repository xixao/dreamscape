'use client';

import { useRef, useState, type Ref } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { Screen } from '@/lib/files/repository';
import { cn } from '@/lib/utils';
import { CHIP_INPUT, DANGER_GHOST, SEG_ITEM } from './chrome';

const NAME_MAX = 80;

function RenameInput({
  screen,
  onCommit,
  onCancel,
  inputRef,
}: {
  screen: Screen;
  onCommit: (name: string) => void;
  onCancel: () => void;
  inputRef: Ref<HTMLInputElement>;
}) {
  // Commits on Enter, cancels on Escape (spec: "double-click renames inline,
  // Enter/Escape") - deliberately no commit-on-blur: when this opens from
  // the chevron menu's Rename item, Radix's DropdownMenu is still tearing
  // down its own FocusScope at the moment this mounts (the menu item and
  // this input are swapped in by the same setRenamingId update) and moves
  // focus to <body> right after, which a commit-on-blur handler would
  // wrongly read as the user clicking away and use to commit the unchanged
  // value immediately. autoFocus covers the double-click path (no Radix
  // menu involved, so nothing fights it for focus); the chevron-menu path
  // relies instead on DropdownMenuContent's onCloseAutoFocus focusing
  // `inputRef` directly once Radix has fully finished closing - see there.
  return (
    <Input
      ref={inputRef}
      autoFocus
      aria-label="Screen name"
      defaultValue={screen.name}
      className={cn(CHIP_INPUT, 'w-28 rounded-sm bg-(--chip) px-2 py-1')}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onCommit(event.currentTarget.value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

export function ScreensStrip({
  screens,
  currentScreenId,
  onSelect,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
}: {
  screens: Screen[];
  currentScreenId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Screen | null>(null);
  // renamingId is a single id, so at most one RenameInput is ever mounted -
  // one shared ref covers whichever screen is currently being renamed. Read
  // from DropdownMenuContent's onCloseAutoFocus below.
  const renameInputRef = useRef<HTMLInputElement>(null);

  function commitRename(target: Screen, raw: string): void {
    setRenamingId(null);
    const trimmed = raw.trim().slice(0, NAME_MAX);
    if (!trimmed || trimmed === target.name) return;
    onRename(target.id, trimmed);
  }

  return (
    <div className="flex items-center gap-1">
      <div role="tablist" aria-label="Screens" className="flex items-center gap-0.5">
        {screens.map((item) => (
          <div key={item.id} className="flex items-center">
            {renamingId === item.id ? (
              <RenameInput
                screen={item}
                onCommit={(name) => commitRename(item, name)}
                onCancel={() => setRenamingId(null)}
                inputRef={renameInputRef}
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={item.id === currentScreenId}
                data-state={item.id === currentScreenId ? 'on' : 'off'}
                className={cn(SEG_ITEM, 'flex-none rounded-sm px-3 py-1')}
                onClick={() => onSelect(item.id)}
                onDoubleClick={() => setRenamingId(item.id)}
              >
                {item.name}
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${item.name} menu`}
                  className="size-6"
                >
                  <ChevronDown className="size-3" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                // event.preventDefault() stops Radix returning focus to the
                // trigger button the instant the menu finishes closing,
                // which would blur the rename input this item's onSelect
                // just mounted with autoFocus and immediately commit/cancel
                // the rename before the user has typed anything. autoFocus
                // alone isn't reliable in a real browser though - its exit
                // animation leaves focus sitting on the closing menu content
                // instead of the input - so this also focuses+selects the
                // input directly once Radix has fully finished closing: the
                // one point guaranteed to come after whatever Radix itself
                // just did with focus, in jsdom (no exit animation, so this
                // fires synchronously on close) as well as a real browser.
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  const input = renameInputRef.current;
                  if (input) {
                    input.focus();
                    input.select();
                  }
                }}
              >
                <DropdownMenuItem onSelect={() => setRenamingId(item.id)}>Rename</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onDuplicate(item.id)}>Duplicate</DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={screens.length <= 1}
                  onSelect={() => setDeleteTarget(item)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label="New screen" className="size-7" onClick={onAdd}>
        <Plus className="size-3.5" aria-hidden />
      </Button>

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
              This removes the screen for everyone. Undo will not bring it back.
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
    </div>
  );
}
