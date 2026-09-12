'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EXAMPLES } from '@/lib/examples';

// SF2 §5 .btn look, reused verbatim from the plan for the two Files-page
// actions. h-auto overrides the shadcn Button's fixed h-8 so the literal
// padding drives the box height, the same override CHIP_INPUT/SEARCH_INPUT/
// SEG_ITEM already apply in chrome.ts when fully re-skinning a primitive.
const SECONDARY_BUTTON =
  'h-auto bg-muted border border-border rounded-[9px] px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-accent';
const PRIMARY_BUTTON =
  'h-auto text-[13px] bg-[image:var(--grad)] text-white font-semibold border-0 rounded-[9px] px-[15px] py-[9px] hover:brightness-[1.08] hover:text-white';

export function FilesActions() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const example = EXAMPLES[0];

  async function createFile(body: { example?: 'login' }) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError('Could not create the file. Try again.');
        return;
      }
      const data = await response.json();
      router.push(`/f/${data.file.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className={SECONDARY_BUTTON}
          disabled={pending}
          onClick={() => createFile({ example: example.slug })}
        >
          New from example: {example.name}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={PRIMARY_BUTTON}
          disabled={pending}
          onClick={() => createFile({})}
        >
          + New file
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[12.5px] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
