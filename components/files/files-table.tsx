'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Folder, FolderInput, Pencil, Trash2, type LucideIcon } from 'lucide-react';
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
import type { FileSummary, FolderSummary } from '@/lib/files/repository';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { MoveDialog, type MoveTarget } from './move-dialog';
import { NewFolderRow } from './new-folder-row';

const TH = cn(LABEL, 'text-left px-4 py-3 border-b border-line-soft');

// A row being renamed: a file carries its own updatedAt (needed as
// baseUpdatedAt for the file's optimistic-concurrency PATCH); a folder has
// no such token, so PATCH /api/folders/[id] takes just the new name.
type RenameTarget = { kind: 'file' | 'folder'; id: string; name: string; updatedAt?: string };
type DeleteTarget = { kind: 'file' | 'folder'; id: string; name: string };

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
  disabled = false,
  disabledLabel,
}: {
  label: string;
  icon: LucideIcon;
  className?: string;
  onClick: () => void;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  // Deliberately not the native `disabled` attribute: the shadcn Button's
  // base class sets `disabled:pointer-events-none`, which would also block
  // the hover that reveals this Tooltip's "why" (e.g. "Empty the folder
  // first"). aria-disabled plus a guarded onClick keeps the row inert
  // without losing the hover affordance.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-disabled={disabled || undefined}
          className={cn(className, disabled && 'opacity-45 cursor-default hover:bg-transparent')}
          onClick={() => {
            if (disabled) return;
            onClick();
          }}
        >
          <Icon className="size-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{disabled && disabledLabel ? disabledLabel : label}</TooltipContent>
    </Tooltip>
  );
}

export function FilesTable({
  folderId,
  folders,
  files,
  isAddingFolder,
  onCancelAddFolder,
}: {
  folderId: string | null;
  folders: FolderSummary[];
  files: FileSummary[];
  isAddingFolder: boolean;
  onCancelAddFolder: () => void;
}) {
  const router = useRouter();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [rowMessage, setRowMessage] = useState<{ id: string; text: string } | null>(null);

  function startRename(id: string) {
    setRenamingId(id);
    setRenameError(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameError(null);
  }

  async function commitRename(target: RenameTarget, rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed || trimmed === target.name) {
      cancelRename();
      return;
    }

    const response =
      target.kind === 'file'
        ? await fetch(`/api/files/${target.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: trimmed, baseUpdatedAt: target.updatedAt }),
          })
        : await fetch(`/api/folders/${target.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: trimmed }),
          });

    if (response.status === 409) {
      setRenameError('Someone else changed this file. Reload.');
      return;
    }

    if (!response.ok) {
      setRenameError(
        target.kind === 'file' ? 'Could not rename the file. Try again.' : 'Could not rename the folder. Try again.',
      );
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

  async function handleDelete(target: DeleteTarget) {
    setRowMessage(null);
    const response =
      target.kind === 'file'
        ? await fetch(`/api/files/${target.id}`, { method: 'DELETE' })
        : await fetch(`/api/folders/${target.id}`, { method: 'DELETE' });

    // A 404 means the row is already gone (e.g. deleted elsewhere), so the
    // refresh that drops it from the list is exactly what we want, with no
    // error to show. Any other non-2xx is a real failure: leave the row
    // as-is and report it instead of refreshing.
    if (!response.ok && response.status !== 404) {
      setRowMessage({
        id: target.id,
        text:
          target.kind === 'file'
            ? 'Could not delete the file. Reload and try again.'
            : 'Could not delete the folder. Reload and try again.',
      });
      return;
    }
    router.refresh();
  }

  const isEmpty = folders.length === 0 && files.length === 0;

  if (isEmpty && !isAddingFolder) {
    return (
      <div className={EMPTY}>
        <span className={EMPTY_TITLE}>{folderId === null ? 'No files yet' : 'This folder is empty'}</span>
        {folderId === null ? 'Create your first file to get started.' : 'Create a file or a folder to get started.'}
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
            {isAddingFolder && <NewFolderRow folderId={folderId} onDone={onCancelAddFolder} />}

            {folders.map((folder, index) => {
              const isLastRow = files.length === 0 && index === folders.length - 1;
              const border = isLastRow ? '' : 'border-b border-line-soft';
              const td = cn('px-4 py-[13px] text-[13.5px] align-middle', border);
              const notEmpty = folder.fileCount + folder.folderCount > 0;

              return (
                <tr key={folder.id} className="hover:bg-white/[.02]">
                  <td className={td}>
                    {renamingId === folder.id ? (
                      <div>
                        <div className={CHIP}>
                          <Input
                            autoFocus
                            aria-label="Folder name"
                            defaultValue={folder.name}
                            className={CHIP_INPUT}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                void commitRename(
                                  { kind: 'folder', id: folder.id, name: folder.name },
                                  event.currentTarget.value,
                                );
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
                        <Link
                          href={`/folders/${folder.id}`}
                          className="inline-flex items-center gap-1.5 font-medium hover:text-acc2"
                        >
                          <Folder className="size-4 text-acc2" aria-hidden />
                          {folder.name}
                        </Link>
                        <RowMessage message={rowMessage?.id === folder.id ? rowMessage.text : null} />
                      </div>
                    )}
                  </td>
                  <td className={td}>
                    <span className="font-mono text-xs text-muted-foreground" title={folder.updatedAt}>
                      {relativeTime(folder.updatedAt)}
                    </span>
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <div className="flex items-center justify-end gap-1">
                      <IconAction label="Rename" icon={Pencil} onClick={() => startRename(folder.id)} />
                      <IconAction
                        label="Move to"
                        icon={FolderInput}
                        onClick={() =>
                          setMoveTarget({
                            kind: 'folder',
                            id: folder.id,
                            name: folder.name,
                            currentFolderId: folder.parentId,
                          })
                        }
                      />
                      <IconAction
                        label="Delete"
                        icon={Trash2}
                        className={DANGER_GHOST}
                        disabled={notEmpty}
                        disabledLabel="Empty the folder first"
                        onClick={() => setDeleteTarget({ kind: 'folder', id: folder.id, name: folder.name })}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}

            {files.map((file, index) => {
              const isLastRow = index === files.length - 1;
              const border = isLastRow ? '' : 'border-b border-line-soft';
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
                                void commitRename(
                                  { kind: 'file', id: file.id, name: file.name, updatedAt: file.updatedAt },
                                  event.currentTarget.value,
                                );
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
                        label="Move to"
                        icon={FolderInput}
                        onClick={() =>
                          setMoveTarget({
                            kind: 'file',
                            id: file.id,
                            name: file.name,
                            currentFolderId: file.folderId ?? null,
                            baseUpdatedAt: file.updatedAt,
                          })
                        }
                      />
                      <IconAction
                        label="Delete"
                        icon={Trash2}
                        className={DANGER_GHOST}
                        onClick={() => setDeleteTarget({ kind: 'file', id: file.id, name: file.name })}
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
              {deleteTarget?.kind === 'folder'
                ? 'This removes the folder for everyone. Undo will not bring it back.'
                : 'This removes the file for everyone. Undo will not bring it back.'}
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

      <MoveDialog
        target={moveTarget}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
        onMoved={() => {
          setMoveTarget(null);
          router.refresh();
        }}
        onError={(message) => {
          setRowMessage(moveTarget ? { id: moveTarget.id, text: message } : null);
          setMoveTarget(null);
        }}
      />
    </TooltipProvider>
  );
}
