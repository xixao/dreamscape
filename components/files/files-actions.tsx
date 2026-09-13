'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/workbench/chrome';
import { EXAMPLES, type ExampleSlug } from '@/lib/examples';

export function FilesActions({
  folderId,
  onNewFolder,
}: {
  folderId: string | null;
  onNewFolder: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createFile(body: { example?: ExampleSlug }) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, folderId }),
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
        <Button type="button" variant="ghost" className={SECONDARY_BUTTON} onClick={onNewFolder}>
          New folder
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className={SECONDARY_BUTTON} disabled={pending}>
              New from example
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {EXAMPLES.map((example) => (
              <DropdownMenuItem key={example.slug} onSelect={() => createFile({ example: example.slug })}>
                {example.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
