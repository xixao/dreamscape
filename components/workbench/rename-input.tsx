'use client';

import { type Ref } from 'react';
import { Input } from '@/components/ui/input';
import type { Screen } from '@/lib/files/repository';
import { cn } from '@/lib/utils';
import { CHIP_INPUT } from './chrome';

// Name max for both frames and pages (both come from validateScreens/validatePages'
// shared 1..80 rule in lib/files/validate.ts).
export const NAME_MAX = 80;

/**
 * A reusable inline rename input used by both the frames chip menu (a frame
 * row's own Rename item swaps that row for this one, the dropdown staying
 * open around it - see frames-chip.tsx) and the frame title's double-click
 * rename (no menu involved there). Commits on Enter, cancels on Escape;
 * autoFocus covers both call sites.
 */
export function RenameInput({
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
  return (
    <Input
      ref={inputRef}
      autoFocus
      aria-label="Frame name"
      defaultValue={screen.name}
      className={cn(CHIP_INPUT, 'w-28 rounded-sm bg-(--chip) px-2 py-1')}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        // Stops every keystroke here - not just Enter/Escape - from
        // bubbling up: when this renders inside the frames chip's still-
        // open DropdownMenuContent, Radix's own menu-level onKeyDown
        // handler treats any un-prevented single-character key as
        // type-ahead search input (@radix-ui/react-menu's
        // handleTypeaheadSearch) and would otherwise steal focus to
        // whichever row's name starts with the letter just typed, out from
        // under this input mid-rename. Harmless where there is no
        // surrounding menu (the frame title's double-click path).
        event.stopPropagation();
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
