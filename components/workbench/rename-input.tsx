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
 * A reusable inline rename input used by both the frames chip menu and the frame
 * title's double-click rename. Commits on Enter, cancels on Escape. autoFocus
 * covers the double-click path; the chip's menu path relies on
 * DropdownMenuContent's onCloseAutoFocus focusing the input directly once the
 * menu has fully finished closing.
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
