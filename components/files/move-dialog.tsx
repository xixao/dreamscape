'use client';

import { useEffect, useState } from 'react';
import { Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FolderSummary } from '@/lib/files/repository';
import { cn } from '@/lib/utils';

// A row being moved: either a folder (PATCH /api/folders/[id] with
// parentId) or a file (PATCH /api/files/[id] with folderId + the
// baseUpdatedAt it was listed with, matching the same optimistic
// concurrency check file rename already uses).
export type MoveTarget = {
  kind: 'file' | 'folder';
  id: string;
  name: string;
  currentFolderId: string | null;
  baseUpdatedAt?: string;
};

type FolderNode = FolderSummary & { children: FolderNode[] };

function buildTree(all: FolderSummary[]): FolderNode[] {
  const byId = new Map<string, FolderNode>();
  for (const folder of all) byId.set(folder.id, { ...folder, children: [] });

  const roots: FolderNode[] = [];
  for (const folder of all) {
    const node = byId.get(folder.id);
    if (!node) continue;
    const parent = folder.parentId !== null ? byId.get(folder.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// The folder being moved and everything under it can never become its own
// destination (that would create a cycle), so those rows are disabled.
function computeDisabledIds(all: FolderSummary[], movingId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const folder of all) {
    if (folder.parentId === null) continue;
    const list = childrenByParent.get(folder.parentId) ?? [];
    list.push(folder.id);
    childrenByParent.set(folder.parentId, list);
  }

  const disabled = new Set<string>([movingId]);
  const queue = [movingId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    for (const childId of childrenByParent.get(current) ?? []) {
      if (!disabled.has(childId)) {
        disabled.add(childId);
        queue.push(childId);
      }
    }
  }
  return disabled;
}

function OptionRow({
  label,
  depth,
  selected,
  disabled,
  current,
  showIcon,
  onSelect,
}: {
  label: string;
  depth: number;
  selected: boolean;
  disabled: boolean;
  current: boolean;
  showIcon: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onSelect}
      style={{ paddingLeft: 12 + depth * 16 }}
      className={cn(
        'flex w-full items-center gap-2 rounded-md py-1.5 pr-3 text-left text-[13px]',
        selected ? 'bg-accent text-foreground' : 'text-foreground hover:bg-muted',
        disabled && 'opacity-45 cursor-default hover:bg-transparent',
      )}
    >
      {showIcon && <Folder className="size-4 shrink-0 text-acc2" aria-hidden />}
      <span className="truncate">{label}</span>
      {current && <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">Current</span>}
    </button>
  );
}

export function MoveDialog({
  target,
  onOpenChange,
  onMoved,
  onError,
}: {
  target: MoveTarget | null;
  onOpenChange: (open: boolean) => void;
  onMoved: () => void;
  onError: (message: string) => void;
}) {
  const open = target !== null;
  const [wasOpen, setWasOpen] = useState(false);
  const [allFolders, setAllFolders] = useState<FolderSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Reset the selection right when the dialog transitions from closed to
  // open (React's documented "adjusting state when a prop changes"
  // pattern - https://react.dev/learn/you-might-not-need-an-effect - a
  // conditional setState during render, not inside the effect below,
  // which would otherwise cause an extra render and trip the
  // set-state-in-effect lint rule). Keyed on the open/closed transition
  // rather than target?.id so reopening the same file or folder still
  // resets to its current location instead of an old, discarded pick.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && target) setSelectedId(target.currentFolderId);
  }

  // Refetched every time the dialog opens, per spec: the destination list
  // should reflect the current folder tree, not a stale one from an
  // earlier open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    fetch('/api/folders/all')
      .then((response) => (response.ok ? response.json() : { folders: [] }))
      .then((data: { folders: FolderSummary[] }) => {
        if (!cancelled) setAllFolders(data.folders ?? []);
      })
      .catch(() => {
        if (!cancelled) setAllFolders([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!target) return null;

  const disabledIds = target.kind === 'folder' ? computeDisabledIds(allFolders, target.id) : new Set<string>();
  const tree = buildTree(allFolders);

  function renderNode(node: FolderNode, depth: number) {
    return (
      <div key={node.id}>
        <OptionRow
          label={node.name}
          depth={depth}
          showIcon
          selected={selectedId === node.id}
          disabled={disabledIds.has(node.id)}
          current={target?.currentFolderId === node.id}
          onSelect={() => setSelectedId(node.id)}
        />
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  async function handleMove() {
    if (!target) return;
    setPending(true);
    try {
      const response =
        target.kind === 'folder'
          ? await fetch(`/api/folders/${target.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ parentId: selectedId }),
            })
          : await fetch(`/api/files/${target.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folderId: selectedId, baseUpdatedAt: target.baseUpdatedAt }),
            });

      onOpenChange(false);
      if (!response.ok) {
        onError(
          target.kind === 'folder' ? 'Could not move the folder. Try again.' : 'Could not move the file. Try again.',
        );
        return;
      }
      onMoved();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {target.name}</DialogTitle>
        </DialogHeader>
        <div role="radiogroup" aria-label="Destination" className="-mx-1 max-h-72 overflow-y-auto px-1">
          <OptionRow
            label="Top level"
            depth={0}
            showIcon={false}
            selected={selectedId === null}
            disabled={false}
            current={target.currentFolderId === null}
            onSelect={() => setSelectedId(null)}
          />
          {tree.map((node) => renderNode(node, 0))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={() => void handleMove()} disabled={pending}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
