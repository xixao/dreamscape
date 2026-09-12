'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Pencil, Trash2, type LucideIcon } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CHIP, CHIP_INPUT, DANGER_GHOST, EMPTY, EMPTY_TITLE, LABEL } from '@/components/workbench/chrome';
import type { FileSummary } from '@/lib/files/repository';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const TH = cn(LABEL, 'text-left px-4 py-3 border-b border-line-soft');

function RowMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-[12.5px] text-bad">
      {message}
    </p>
  );
}

function IconAction({
  label,
  icon: Icon,
  className,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  className?: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className={className} onClick={onClick}>
          <Icon className="size-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function FilesTable({ files }: { files: FileSummary[] }) {
  const router = useRouter();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileSummary | null>(null);
  const [rowMessage, setRowMessage] = useState<{ id: string; text: string } | null>(null);

  function startRename(id: string) {
    setRenamingId(id);
    setRenameError(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameError(null);
  }

  async function commitRename(file: FileSummary, rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed || trimmed === file.name) {
      cancelRename();
      return;
    }

    const response = await fetch(`/api/files/${file.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, baseUpdatedAt: file.updatedAt }),
    });

    if (response.status === 409) {
      setRenameError('Someone else changed this file. Reload.');
      return;
    }

    if (!response.ok) {
      setRenameError('Could not rename the file. Try again.');
      return;
    }

    cancelRename();
    router.refresh();
  }

  async function handleDuplicate(file: FileSummary) {
    setRowMessage(null);
    const response = await fetch(`/api/files/${file.id}/duplicate`, { method: 'POST' });
    if (!response.ok) {
      setRowMessage({ id: file.id, text: 'Could not duplicate the file. Try again.' });
      return;
    }
    const data = await response.json();
    router.push(`/f/${data.file.id}`);
  }

  async function handleDelete(file: FileSummary) {
    setRowMessage(null);
    const response = await fetch(`/api/files/${file.id}`, { method: 'DELETE' });
    // A 404 means the file is already gone (e.g. deleted elsewhere), so the
    // refresh that drops it from the list is exactly what we want, with no
    // error to show. Any other non-2xx is a real failure: leave the row
    // as-is and report it instead of refreshing.
    if (!response.ok && response.status !== 404) {
      setRowMessage({ id: file.id, text: 'Could not delete the file. Reload and try again.' });
      return;
    }
    router.refresh();
  }

  if (files.length === 0) {
    return (
      <div className={EMPTY}>
        <span className={EMPTY_TITLE}>No files yet</span>
        Create your first file to get started.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="bg-card border border-line-soft rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>Name</th>
              <th className={TH}>Updated</th>
              <th className={TH}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, index) => {
              const border = index === files.length - 1 ? '' : 'border-b border-line-soft';
              const td = cn('px-4 py-[13px] text-[13.5px] align-middle', border);

              return (
                <tr key={file.id} className="hover:bg-white/[.02]">
                  <td className={td}>
                    {renamingId === file.id ? (
                      <div>
                        <div className={CHIP}>
                          <Input
                            autoFocus
                            aria-label="File name"
                            defaultValue={file.name}
                            className={CHIP_INPUT}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                void commitRename(file, event.currentTarget.value);
                              } else if (event.key === 'Escape') {
                                cancelRename();
                              }
                            }}
                          />
                        </div>
                        <RowMessage message={renameError} />
                      </div>
                    ) : (
                      <div>
                        <Link href={`/f/${file.id}`} className="font-medium hover:text-acc2">
                          {file.name}
                        </Link>
                        <RowMessage message={rowMessage?.id === file.id ? rowMessage.text : null} />
                      </div>
                    )}
                  </td>
                  <td className={td}>
                    <span className="font-mono text-xs text-muted-foreground" title={file.updatedAt}>
                      {relativeTime(file.updatedAt)}
                    </span>
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <div className="flex items-center justify-end gap-1">
                      <IconAction label="Duplicate" icon={Copy} onClick={() => void handleDuplicate(file)} />
                      <IconAction label="Rename" icon={Pencil} onClick={() => startRename(file.id)} />
                      <IconAction
                        label="Delete"
                        icon={Trash2}
                        className={DANGER_GHOST}
                        onClick={() => setDeleteTarget(file)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
              This removes the file for everyone. Undo will not bring it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="ghost"
              className={DANGER_GHOST}
              onClick={() => {
                if (deleteTarget) void handleDelete(deleteTarget);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
