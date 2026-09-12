'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { CHIP, CHIP_INPUT } from '@/components/workbench/chrome';
import { cn } from '@/lib/utils';

// The inline "New folder" row (spec section 4): rendered as the first row
// of the files table when the page-head "New folder" button is clicked.
// Enter with a non-empty name creates the folder at the current level and
// refreshes; Escape or an empty Enter just calls onDone to hide the row.
// A failed create leaves the row open (with an inline error) rather than
// silently closing, mirroring how an inline rename stays open on failure.
export function NewFolderRow({ folderId, onDone }: { folderId: string | null; onDone: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function commit(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      onDone();
      return;
    }

    const response = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, parentId: folderId }),
    });

    if (!response.ok) {
      setError('Could not create the folder. Try again.');
      return;
    }

    onDone();
    router.refresh();
  }

  return (
    <tr>
      <td colSpan={3} className="px-4 py-[13px] align-middle">
        <div className={cn(CHIP, 'max-w-xs')}>
          <Input
            autoFocus
            aria-label="Folder name"
            placeholder="Folder name"
            className={CHIP_INPUT}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void commit(event.currentTarget.value);
              } else if (event.key === 'Escape') {
                onDone();
              }
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
