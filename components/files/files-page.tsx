import { PANEL } from '@/components/workbench/chrome';
import type { FileSummary } from '@/lib/files/repository';
import { cn } from '@/lib/utils';
import { FilesActions } from './files-actions';
import { FilesTable } from './files-table';

export function FilesPage({ files }: { files: FileSummary[] }) {
  const count = files.length === 1 ? '1 file' : `${files.length} files`;

  return (
    <div className="max-w-[1420px] mx-auto px-5 pt-4">
      <header
        className={cn(PANEL, 'shadow-panel', 'h-[54px] px-3.5 flex items-center gap-2 sticky top-3 z-30')}
      >
        <span className="text-[13px] font-semibold">Assembly Workbench</span>
      </header>
      <div className="pt-[26px] px-1 pb-10">
        <div className="flex items-center gap-3.5 mb-[18px]">
          <h1 className="text-2xl font-semibold">Files</h1>
          <span className="font-mono text-xs font-medium text-muted-foreground">{count}</span>
          <div className="flex-1" />
          <FilesActions />
        </div>
        <FilesTable files={files} />
      </div>
    </div>
  );
}
