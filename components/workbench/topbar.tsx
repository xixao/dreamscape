'use client';

import { useState } from 'react';
import { useEditor } from '@craftjs/core';
import Link from 'next/link';
import {
  ArrowLeft,
  FilePlus2,
  MessageCircle,
  Monitor,
  Play,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { SaveState } from '@/lib/persistence';
import type { Breakpoint } from '@/lib/responsive';
import { STAGE_PRESETS, STAGE_PRESET_ORDER, type StagePreset } from '@/lib/stage';
import { cn } from '@/lib/utils';
import { CHIP, CHIP_INPUT, PANEL, SEG_GROUP, SEG_ITEM } from './chrome';
import { useStage } from './stage-context';

const PRESET_META: Record<StagePreset, { label: string; icon: LucideIcon }> = {
  mobile: { label: 'Mobile', icon: Smartphone },
  tablet: { label: 'Tablet', icon: Tablet },
  desktop: { label: 'Desktop', icon: Monitor },
};

const MAX_NAME_LENGTH = 120;

export function stageReadout(width: number, breakpoint: Breakpoint, zoom: number): string {
  const parts = [`${width} px`, breakpoint];
  if (zoom < 1) parts.push(`${Math.round(zoom * 100)}%`);
  return parts.join(' · ');
}

function IconAction({
  label,
  icon: Icon,
  disabled,
  onClick,
  pressed,
  badge,
}: {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
  // Comment tool only: `aria-pressed` for the toggle state and a mono
  // open-thread count shown as a small badge when there is at least one
  // (spec docs/superpowers/specs/2026-09-12-folders-and-comments-design.md
  // section 5, "the comment tool button shows the open thread count").
  pressed?: boolean;
  badge?: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className="relative"
        >
          <Icon className="size-4" aria-hidden />
          {!!badge && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-mono text-[9px] font-semibold text-white">
              {badge}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function FileNameField({
  fileName,
  onRename,
}: {
  fileName: string;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(fileName);
  // The committed name can also change from outside (a save resolving a
  // rename queued elsewhere), so stay in sync with the prop between edits.
  // Adjusted during render rather than in an effect, per React's own
  // guidance, so it applies before this render commits instead of causing an
  // extra one.
  const [syncedFileName, setSyncedFileName] = useState(fileName);
  if (fileName !== syncedFileName) {
    setSyncedFileName(fileName);
    setValue(fileName);
  }

  function commit(raw: string): void {
    const trimmed = raw.trim().slice(0, MAX_NAME_LENGTH);
    if (!trimmed) {
      setValue(fileName);
      return;
    }
    setValue(trimmed);
    if (trimmed !== fileName) onRename(trimmed);
  }

  return (
    <div className={cn(CHIP, 'w-56')}>
      <Input
        value={value}
        aria-label="File name"
        data-testid="file-name"
        maxLength={MAX_NAME_LENGTH}
        className={CHIP_INPUT}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(event.currentTarget.value);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setValue(fileName);
          }
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
      />
    </div>
  );
}

const SAVE_STATE_TEXT: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving',
  error: 'Save failed, retrying',
  conflict: 'Someone else changed this file.',
};

const SAVE_STATE_CLASS: Record<SaveState, string> = {
  saved: 'text-muted-foreground',
  saving: 'text-muted-foreground',
  error: 'text-warn',
  conflict: 'text-bad',
};

function SaveIndicator({ saveState, notice }: { saveState: SaveState; notice?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        data-testid="save-state"
        className={cn('font-mono text-[11px]', notice ? 'text-warn' : SAVE_STATE_CLASS[saveState])}
      >
        {notice ?? SAVE_STATE_TEXT[saveState]}
      </span>
      {!notice && saveState === 'conflict' && (
        <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      )}
    </div>
  );
}

export function Topbar({
  fileName,
  onRename,
  saveState,
  notice,
  onNew,
  fileId,
  folderId,
  currentScreenId,
  commentMode = false,
  onToggleCommentMode,
  commentCount = 0,
}: {
  fileName: string;
  onRename: (name: string) => void;
  saveState: SaveState;
  notice?: string;
  onNew: () => void;
  fileId: string;
  folderId: string | null;
  currentScreenId: string;
  commentMode?: boolean;
  onToggleCommentMode?: () => void;
  commentCount?: number;
}) {
  const { width, breakpoint, preset, zoom, setPreset } = useStage();
  const { actions, canUndo, canRedo } = useEditor((_, query) => ({
    canUndo: query.history.canUndo(),
    canRedo: query.history.canRedo(),
  }));
  const filesHref = folderId ? `/folders/${folderId}` : '/';
  const presentHref = `/f/${fileId}/play?screen=${currentScreenId}`;

  return (
    <TooltipProvider delayDuration={0}>
      <header className={cn(PANEL, 'shadow-panel', 'col-span-3 flex h-[54px] items-center gap-2 px-3.5')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href={filesHref} aria-label="Files" className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </TooltipTrigger>
          <TooltipContent>Files</TooltipContent>
        </Tooltip>
        <span className="text-[13px] font-semibold">Assembly Workbench</span>
        <span className="font-mono text-[13px] text-muted-foreground" aria-hidden>
          ›
        </span>
        <FileNameField fileName={fileName} onRename={onRename} />
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-[22px]" />
        <ToggleGroup
          type="single"
          aria-label="Frame width"
          value={preset ?? ''}
          onValueChange={(value) => {
            if (value) setPreset(value as StagePreset);
          }}
          className={cn(SEG_GROUP, 'w-auto')}
        >
          {STAGE_PRESET_ORDER.map((key) => {
            const { label, icon: Icon } = PRESET_META[key];
            return (
              <ToggleGroupItem
                key={key}
                value={key}
                title={`${STAGE_PRESETS[key]} px`}
                className={cn(SEG_ITEM, 'gap-1.5 px-3')}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <span
          data-testid="stage-readout"
          className="font-mono text-[11px] text-muted-foreground tabular-nums"
        >
          {stageReadout(width, breakpoint, zoom)}
        </span>
        <SaveIndicator saveState={saveState} notice={notice} />
        <div className="flex-1" />
        <IconAction
          label="Comment tool"
          icon={MessageCircle}
          pressed={commentMode}
          badge={commentCount}
          onClick={() => onToggleCommentMode?.()}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={presentHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Present"
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            >
              <Play className="size-4" aria-hidden />
            </a>
          </TooltipTrigger>
          <TooltipContent>Present</TooltipContent>
        </Tooltip>
        <IconAction label="Undo" icon={Undo2} disabled={!canUndo} onClick={() => actions.history.undo()} />
        <IconAction label="Redo" icon={Redo2} disabled={!canRedo} onClick={() => actions.history.redo()} />
        <IconAction label="New frame" icon={FilePlus2} onClick={onNew} />
      </header>
    </TooltipProvider>
  );
}
