'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { CHIP, CHIP_INPUT } from '@/components/workbench/chrome';
import { cn } from '@/lib/utils';

// The inline "New folder" row (spec section 4): rendered as the first row
// of the files table when the page-head "New folder" button is clicked.
// Enter with a non-empty name creates the folder at the current level and
// refreshes; Escape or an empty Enter just calls onDone to hide the row.
// Clicking away (blur) commits too, the same as Enter - a lone text field
// with no visible confirm button reads as unfinished business otherwise
// (Matt, 2026-09-14: "there's no way for it to register as 'done' when
// typing the folder name"), and it is what every other inline-add row a
// user has ever used does. `pending` disables the field for the moment the
// request is in flight, so committing is visibly happening rather than a
// silent pause that reads as nothing having worked - disabling a focused
// input also fires a native blur, which is why `settledRef` (not React
// state, which would not update in time) guards every path against
// running commit() twice for one keypress. A failed create leaves the row
// open (with an inline error, re-enabled for another try) rather than
// silently closing, mirroring how an inline rename stays open on failure.
export function NewFolderRow({ folderId, onDone }: { folderId: string | null; onDone: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settledRef = useRef(false);

  async function commit(rawValue: string) {
    if (settledRef.current || pending) return;

    const trimmed = rawValue.trim();
    if (!trimmed) {
      settledRef.current = true;
      onDone();
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, parentId: folderId }),
      });

      if (!response.ok) {
        setError('Could not create the folder. Try again.');
        return;
      }

      settledRef.current = true;
      onDone();
      router.refresh();
    } catch {
      setError('Could not create the folder. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <tr>
      <td colSpan={3} className="px-4 py-[13px] align-middle">
        <div className={cn(CHIP, 'max-w-xs')}>
          <Input
            autoFocus
            aria-label="Folder name"
            placeholder="Folder name"
            disabled={pending}
            className={CHIP_INPUT}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void commit(event.currentTarget.value);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                settledRef.current = true;
                onDone();
              }
            }}
            onBlur={(event) => {
              void commit(event.currentTarget.value);
            }}
          />
        </div>
        {error && (
          <p role="alert" className="mt-1 text-[12.5px] text-bad">
            {error}
          </p>
        )}
      </td>
    </tr>
  );
}
