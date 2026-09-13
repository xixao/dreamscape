'use client';

import { useState } from 'react';
import { useEditor } from '@craftjs/core';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FilePlus2,
  MessageCircle,
  Command,
  MessageSquareText,
  Monitor,
  MoreHorizontal,
  Play,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Page, Screen } from '@/lib/files/repository';
import { zoomTo } from '@/lib/canvas/viewport';
import type { SaveState } from '@/lib/persistence';
import { formatKeys, SHORTCUTS_BY_ID } from '@/lib/shortcuts';
import { STAGE_PRESETS, STAGE_PRESET_ORDER, type StagePreset } from '@/lib/stage';
import { DEVICE_PRESET_GROUPS } from '@/lib/stage/device-presets';
import { readoutFor } from '@/lib/stage/size';
import { cn } from '@/lib/utils';
import { useCanvasViewport } from './canvas';
import { CHIP, CHIP_INPUT, LABEL, MENU_POPOVER, MENU_ROW, PANEL, SEG_GROUP, SEG_ITEM } from './chrome';
import { PagesMenu } from './pages-menu';
import { useStage } from './stage-context';

const PRESET_META: Record<StagePreset, { label: string; icon: LucideIcon }> = {
  mobile: { label: 'Mobile', icon: Smartphone },
  tablet: { label: 'Tablet', icon: Tablet },
  desktop: { label: 'Desktop', icon: Monitor },
};

const MAX_NAME_LENGTH = 120;

function IconAction({
  label,
  icon: Icon,
  disabled,
  pressed,
  onClick,
  badge,
}: {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  // Undefined (the default) omits aria-pressed entirely, so every existing
  // caller (Undo, Redo, New frame) renders exactly as before. Only a toggle
  // like the Chat button passes an actual boolean.
  pressed?: boolean;
  onClick: () => void;
  // Comment tool only: a mono open-thread count shown as a small badge when
  // there is at least one (spec
  // docs/superpowers/specs/2026-09-12-folders-and-comments-design.md
  // section 5, "the comment tool button shows the open thread count").
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
          className={cn('relative', pressed && 'bg-muted text-foreground')}
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

function DevicePresetMenu({
  deviceName,
  onSelect,
}: {
  deviceName: string | null;
  onSelect: (device: { name: string; width: number; height: number }) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Frame size presets"
          aria-haspopup="menu"
          className={cn(CHIP, 'gap-1.5 px-2 text-[12.5px] font-medium text-foreground')}
        >
          <Smartphone className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="max-w-36 truncate">{deviceName ?? 'Device'}</span>
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {DEVICE_PRESET_GROUPS.map((group) => (
          <DropdownMenuSub key={group.group}>
            <DropdownMenuSubTrigger>{group.group}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {group.devices.map((device) => (
                <DropdownMenuItem key={device.name} aria-label={device.name} onSelect={() => onSelect(device)}>
                  <span className="flex-1">{device.name}</span>
                  <span className={LABEL}>
                    {device.width} × {device.height}
                  </span>
                  {deviceName === device.name && (
                    <Check data-testid="device-check" className="size-3.5 shrink-0" aria-hidden />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The zoom menu's own mono shortcut labels, read from the shared registry
// (lib/shortcuts.ts) so this menu and the keyboard handler can never drift
// apart. Pinned to the 'mac' glyph set rather than the viewer's actual
// platform: every other label in this top bar (Undo/Redo tooltips, the rest
// of the app's chrome) is mac-styled unconditionally today, with no
// existing platform detection anywhere in the UI - only the shortcuts
// overlay (components/workbench/shortcuts-overlay.tsx) is platform-aware.
function zoomKeys(id: 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'zoom-to-fit' | 'zoom-to-selection'): string {
  return formatKeys(SHORTCUTS_BY_ID[id].keys, 'mac');
}

// Fixed zoom percentages the menu jumps straight to, alongside the stepped
// Zoom in/out and the Zoom to fit/selection items that call back up to
// whoever built those (WorkbenchShell shares the same callbacks with the
// keyboard shortcuts - spec docs/superpowers/specs/2026-09-12-infinite-
// canvas-design.md section 3).
const FIXED_ZOOM_ITEMS: { label: string; target: number }[] = [
  { label: 'Zoom to 50%', target: 0.5 },
  { label: 'Zoom to 100%', target: 1 },
  { label: 'Zoom to 200%', target: 2 },
];

/**
 * The stage readout (`iPhone 16 & 17 Pro · 402 × 874 · 82%`) doubles as the
 * zoom menu's trigger. Reads/writes the canvas viewport directly for the
 * fixed percentages (pure math, no other context needed); Zoom in/out/to
 * fit/to selection call back into the same handlers the keyboard shortcuts
 * use, so the two never drift apart.
 */
function ZoomMenu({
  readoutText,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onZoomToSelection,
}: {
  readoutText: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onZoomToSelection: () => void;
}) {
  const { setViewport, viewportSize } = useCanvasViewport();

  function zoomToPercent(target: number): void {
    const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
    setViewport((current) => zoomTo(current, center, target));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="stage-readout"
          aria-label="Zoom"
          aria-haspopup="menu"
          className="font-mono text-[11px] text-muted-foreground tabular-nums hover:text-foreground"
        >
          {readoutText}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={MENU_POPOVER}>
        <DropdownMenuItem className={MENU_ROW} onSelect={onZoomIn}>
          <span className="flex-1">Zoom in</span>
          <span className={LABEL}>{zoomKeys('zoom-in')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ROW} onSelect={onZoomOut}>
          <span className="flex-1">Zoom out</span>
          <span className={LABEL}>{zoomKeys('zoom-out')}</span>
        </DropdownMenuItem>
        {FIXED_ZOOM_ITEMS.map(({ label, target }) => (
          <DropdownMenuItem key={label} className={MENU_ROW} onSelect={() => zoomToPercent(target)}>
            <span className="flex-1">{label}</span>
            {target === 1 && <span className={LABEL}>{zoomKeys('zoom-reset')}</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem className={MENU_ROW} onSelect={onZoomToFit}>
          <span className="flex-1">Zoom to fit</span>
          <span className={LABEL}>{zoomKeys('zoom-to-fit')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ROW} onSelect={onZoomToSelection}>
          <span className="flex-1">Zoom to selection</span>
          <span className={LABEL}>{zoomKeys('zoom-to-selection')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The top bar's overflow menu (spec docs/superpowers/specs/2026-09-13-
// shortcuts-and-elements-design.md section 3): "Keyboard shortcuts" opens
// the shortcuts dialog (shortcuts-overlay.tsx), the same one the ⌘ button
// next to this menu opens. "Download source" is a plain link to the same
// zipped-source route as the files page's own header link
// (components/files/files-page.tsx) - public/dreamscape-source.zip,
// rebuilt by scripts/pack-source.mjs on every build.
function MoreMenu({ onOpenShortcuts }: { onOpenShortcuts?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More">
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={MENU_POPOVER}>
        <DropdownMenuItem className={MENU_ROW} onSelect={() => onOpenShortcuts?.()}>
          Keyboard shortcuts
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ROW} asChild>
          <a href="/dreamscape-source.zip" download>
            Download source
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  pages,
  currentPageId,
  screens,
  onSwitchPage,
  onAddPage,
  onRenamePage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
  currentScreenId,
  commentMode = false,
  onToggleCommentMode,
  commentCount = 0,
  diagramPaletteOpen = false,
  onToggleDiagramPalette,
  chatOpen,
  onToggleChat,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onZoomToSelection,
  onOpenShortcuts,
}: {
  fileName: string;
  onRename: (name: string) => void;
  saveState: SaveState;
  notice?: string;
  onNew: () => void;
  fileId: string;
  folderId: string | null;
  pages: Page[];
  currentPageId: string;
  screens: Screen[];
  onSwitchPage: (id: string) => void;
  onAddPage: () => void;
  onRenamePage: (id: string, name: string) => void;
  onDuplicatePage: (id: string) => void;
  onDeletePage: (id: string) => void;
  onMovePage: (id: string, direction: 'up' | 'down') => void;
  currentScreenId: string;
  commentMode?: boolean;
  onToggleCommentMode?: () => void;
  commentCount?: number;
  // Diagram tool (spec docs/superpowers/specs/2026-09-13-diagrams-design.md
  // section 3): opens/closes the floating shape palette, next to the
  // Comment tool - same on/off toggle shape as commentMode/
  // onToggleCommentMode above, owned by WorkbenchShell.
  diagramPaletteOpen?: boolean;
  onToggleDiagramPalette?: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onZoomToSelection: () => void;
  onOpenShortcuts?: () => void;
}) {
  const { width, height, preset, deviceName, zoom, setPreset, setDevice } = useStage();
  const { actions, canUndo, canRedo } = useEditor((_, query) => ({
    canUndo: query.history.canUndo(),
    canRedo: query.history.canRedo(),
  }));
  const filesHref = folderId ? `/folders/${folderId}` : '/';
  const presentHref = `/f/${fileId}/play?page=${currentPageId}&screen=${currentScreenId}`;

  return (
    <TooltipProvider delayDuration={0}>
      <header
        className={cn(PANEL, 'shadow-panel', 'absolute top-3 left-3 right-3 z-10', 'flex h-[54px] items-center gap-2 px-3.5')}
      >
        {/*
          Breadcrumb (spec docs/superpowers/specs/2026-09-12-pages-design.md
          section 3: "Files › <file> › <page>"), matching the root crumb's
          own wording on the Files page itself (components/files/files-
          page.tsx) - a plain Link, not the shadcn Breadcrumb primitive that
          page uses, since this compact bar already mixes a chevron and an
          editable chip into the same row a real <ol>-based breadcrumb is
          not built to hold. Replaces the old bare ArrowLeft icon button:
          two adjacent links both named "Files" (an icon-only one plus this
          text) would be a confusing, redundant stop for a screen reader,
          so the icon now sits inside this same link instead of its own.
        */}
        <Link
          href={filesHref}
          aria-label="Files"
          className="flex items-center gap-1.5 text-[13px] font-semibold hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Files
        </Link>
        <span className="font-mono text-[13px] text-muted-foreground" aria-hidden>
          ›
        </span>
        <FileNameField fileName={fileName} onRename={onRename} />
        <span className="font-mono text-[13px] text-muted-foreground" aria-hidden>
          ›
        </span>
        <PagesMenu
          pages={pages}
          currentPageId={currentPageId}
          screens={screens}
          onSwitch={onSwitchPage}
          onAdd={onAddPage}
          onRename={onRenamePage}
          onDuplicate={onDuplicatePage}
          onDelete={onDeletePage}
          onMove={onMovePage}
        />
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
        <DevicePresetMenu deviceName={deviceName} onSelect={setDevice} />
        <ZoomMenu
          readoutText={readoutFor({ width, height, deviceName, zoom })}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomToFit={onZoomToFit}
          onZoomToSelection={onZoomToSelection}
        />
        <SaveIndicator saveState={saveState} notice={notice} />
        <div className="flex-1" />
        <IconAction
          label="Comment tool"
          icon={MessageCircle}
          pressed={commentMode}
          badge={commentCount}
          onClick={() => onToggleCommentMode?.()}
        />
        <IconAction
          label="Diagram tool"
          icon={Workflow}
          pressed={diagramPaletteOpen}
          onClick={() => onToggleDiagramPalette?.()}
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
        <IconAction label="Chat" icon={MessageSquareText} pressed={chatOpen} onClick={onToggleChat} />
        <IconAction label="Keyboard shortcuts" icon={Command} onClick={() => onOpenShortcuts?.()} />
        <MoreMenu onOpenShortcuts={onOpenShortcuts} />
      </header>
    </TooltipProvider>
  );
}
