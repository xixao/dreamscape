'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Download, Settings } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { buttonVariants } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PANEL } from '@/components/workbench/chrome';
import type { FileSummary, FolderSummary } from '@/lib/files/repository';
import { cn } from '@/lib/utils';
import { FilesActions } from './files-actions';
import { FilesTable } from './files-table';

// "N folders, M files": singular forms for exactly one, a zero part is
// omitted entirely, and (per spec) the fully-empty case renders no count at
// all - that state is handled by FilesTable's own empty-state message.
function countLabel(folderCount: number, fileCount: number): string {
  const parts: string[] = [];
  if (folderCount > 0) parts.push(folderCount === 1 ? '1 folder' : `${folderCount} folders`);
  if (fileCount > 0) parts.push(fileCount === 1 ? '1 file' : `${fileCount} files`);
  return parts.join(', ');
}

export function FilesPage({
  path,
  folders,
  files,
  folderId,
}: {
  // Root-first, inclusive of the current folder itself (see
  // lib/files/repository.ts's folderPath): [] at the top level, otherwise
  // path[path.length - 1] is the current folder and everything before it
  // is its ancestor chain, root first.
  path: FolderSummary[];
  folders: FolderSummary[];
  files: FileSummary[];
  folderId: string | null;
}) {
  const [isAddingFolder, setIsAddingFolder] = useState(false);

  const title = path.length === 0 ? 'Files' : path[path.length - 1].name;
  // Ancestors shown as links: "Files" (the root) plus every folder in the
  // path except the current one, which is rendered as the plain, current
  // crumb below instead.
  const ancestors =
    path.length === 0 ? [] : [{ id: null as string | null, name: 'Files' }, ...path.slice(0, -1)];
  const count = countLabel(folders.length, files.length);

  return (
    <div className="max-w-[1420px] mx-auto px-5 pt-4">
      <header
        className={cn(PANEL, 'shadow-panel', 'h-[54px] px-3.5 flex items-center gap-2 sticky top-3 z-30')}
      >
        <span className="text-[13px] font-semibold">Dreamscape</span>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href="/dreamscape-source.zip"
                download
                aria-label="Download Dreamscape source"
                className={buttonVariants({ variant: 'ghost', size: 'icon' })}
              >
                <Download className="size-4" aria-hidden />
              </a>
            </TooltipTrigger>
            <TooltipContent>Download Dreamscape source</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Link href="/settings" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'ml-auto gap-2')}><Settings className="size-4" aria-hidden />Settings</Link>
      </header>
      <div className="pt-[26px] px-1 pb-10">
        {/* Only rendered with real ancestors to show (spec: a folder's page
        gets "Files > <ancestors> > <this folder>"). At the root, ancestors
        is empty and the current crumb would just repeat the h1's own
        "Files" text as a redundant eyebrow above it (Matt, 2026-09-14:
        "get rid of the eyebrow 'Files' text above the Files header") -
        there is nothing to navigate to from the root page anyway. */}
        {path.length > 0 && (
          <Breadcrumb className="mb-1.5">
            <BreadcrumbList className="font-mono text-[10.5px]">
              {ancestors.map((ancestor) => (
                <Fragment key={ancestor.id ?? 'root'}>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={ancestor.id === null ? '/' : `/folders/${ancestor.id}`}>{ancestor.name}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </Fragment>
              ))}
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        )}

        <div className="flex items-center gap-3.5 mb-[18px]">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {count && <span className="font-mono text-xs font-medium text-muted-foreground">{count}</span>}
          <div className="flex-1" />
          <FilesActions folderId={folderId} onNewFolder={() => setIsAddingFolder(true)} />
        </div>
        <FilesTable
          folderId={folderId}
          folders={folders}
          files={files}
          isAddingFolder={isAddingFolder}
          onCancelAddFolder={() => setIsAddingFolder(false)}
        />
      </div>
    </div>
  );
}
