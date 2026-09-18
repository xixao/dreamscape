'use client';

import { NoteTool } from './comments/note-tool';
import type { NoteKind } from '@/lib/comments/store';
import { SharePrototypeButton } from './prototype-actions';
import { useState } from 'react';
import { useEditor } from '@craftjs/core';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Monitor,
  Play,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
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
import { SegmentedControl, SegmentedItem } from './segmented-control';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { OverlayPresentationType, Page, Screen } from '@/lib/files/repository';
import { isOverlay } from '@/lib/files/screens';
import { zoomTo } from '@/lib/canvas/viewport';
import type { SaveState } from '@/lib/persistence';
import { formatKeys, SHORTCUTS_BY_ID } from '@/lib/shortcuts';
import { STAGE_PRESETS, STAGE_PRESET_ORDER, type StagePreset } from '@/lib/stage';
import { DEVICE_PRESET_GROUPS } from '@/lib/stage/device-presets';
import { readoutFor } from '@/lib/stage/size';
import { cn } from '@/lib/utils';
import { useCanvasViewport } from './canvas';
import { CHIP, CHIP_INPUT, LABEL, MENU_POPOVER, MENU_ROW, PANEL } from './chrome';
import { FramesChip } from './frames-chip';
import { PagesMenu } from './pages-menu';
import { useStage } from './stage-context';

/**
 * Present's target URL (spec docs/superpowers/specs/2026-09-13-overlay-
 * frames-design.md section 4 + section 5's Present entry point): this top
 * bar's own Play icon link and workbench.tsx's Cmd+R handler both build
 * this exact URL, so the two can never drift apart. Play never stands ON
 * an overlay frame (only ever opens on top of a screen), so when the
 * focused frame is an overlay this omits `screen` entirely and passes
 * `overlay` instead - app/f/[id]/play/page.tsx forwards both straight to
 * the Player, whose resolveInitialScreenId only ever considers plain
 * screens (phase 1) and so lands on the page's own first real screen,
 * with the focused overlay seeded onto the stack on top of it via
 * initialOverlayId. `URLSearchParams` (not a template literal) so both
 * branches build through the same code path and can never format the
 * shared `page` param two different ways.
 *
 * Phase 2 review finding 1: an overlay's own page can end up with no plain
 * screen left on it (every screen on it either never existed or got moved/
 * deleted around the overlay - `wouldStrandPage` stops that through this
 * app's own UI, but does not guarantee it can never happen to older or
 * hand-edited data). Left alone, `page` with no `screen` would fall to
 * resolveInitialScreenId's own page-then-first-page-with-a-screen cascade,
 * which can silently land Play on some OTHER page's first screen - not
 * necessarily one the user meant. So this checks for that case itself and,
 * when the file has a plain screen anywhere else, names it explicitly as
 * `screen` instead (an explicit, valid `screen` always wins outright over
 * `page` in that cascade - see resolveInitialScreenId - so `page` is
 * dropped rather than left in place to imply an agreement with `screen`
 * that is not really there). A file with no plain screen anywhere at all
 * has no better fallback to offer; `page` stays as the least-wrong choice.
 */
export function presentHrefFor(fileId: string, pageId: string, screens: Screen[], focusedScreenId: string): string {
  const focused = screens.find((screen) => screen.id === focusedScreenId);
  if (focused && isOverlay(focused)) {
    const ownPageHasPlainScreen = screens.some((screen) => screen.pageId === pageId && !isOverlay(screen));
    const fallbackScreen = ownPageHasPlainScreen ? undefined : screens.find((screen) => !isOverlay(screen));
    const params = new URLSearchParams(fallbackScreen ? { screen: fallbackScreen.id } : { page: pageId });
    params.set('overlay', focusedScreenId);
    return `/f/${fileId}/play?${params.toString()}`;
  }
  const params = new URLSearchParams({ page: pageId, screen: focusedScreenId });
  return `/f/${fileId}/play?${params.toString()}`;
}

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


function RenameFileField({
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
    <div className={cn(CHIP, 'w-32 shrink min-w-20 xl:w-44')}>
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

export function SaveIndicator({ saveState, notice }: { saveState: SaveState; notice?: string }) {
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


export function Topbar({
  fileName,
  onRename,
  saveState,
  notice,
  onAddScreen,
  onAddOverlay,
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
  onSwitchScreen,
  onRenameScreen,
  onDuplicateScreen,
  onDeleteScreen,
  onMoveScreenToPage,
  onZoomToFrame,
  onHandoff,
  commentMode = false,
  onToggleCommentMode,
  commentCount = 0,
  noteKind, onStartNote, onBrowseNotes, notesVisible, onToggleNotesVisibility,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onZoomToSelection,
  historyOverride,
  hidePageSelector = false,
  frameSelected = true, onCreateDeviceFrame,
}: {
  fileName: string;
  onRename: (name: string) => void;
  saveState: SaveState;
  notice?: string;
  onNew: () => void;
  onAddScreen: () => void;
  onAddOverlay: (type: OverlayPresentationType) => void;
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
  onSwitchScreen: (id: string) => void;
  onRenameScreen: (id: string, name: string) => void;
  onDuplicateScreen: (id: string) => void;
  onDeleteScreen: (id: string) => void;
  onMoveScreenToPage?: (id: string, pageId: string) => void;
  onZoomToFrame: (id: string) => void;
  onHandoff?: () => void;
  commentMode?: boolean;
  onToggleCommentMode?: () => void;
  commentCount?: number;
  notesVisible?: boolean; onToggleNotesVisibility?: () => void;
  noteKind?: NoteKind; onStartNote?: (kind: NoteKind) => void; onBrowseNotes?: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onZoomToSelection: () => void;
  onOpenShortcuts?: () => void;
  frameSelected?: boolean;
  onCreateDeviceFrame?: (device: { name: string; width: number; height: number }) => void;
  hidePageSelector?: boolean;
  historyOverride?: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
}) {
  const { width, height, preset, deviceName, zoom, setPreset, setDevice } = useStage();
  const { actions, canUndo, canRedo } = useEditor((_, query) => ({
    canUndo: query.history.canUndo(),
    canRedo: query.history.canRedo(),
  }));
  const filesHref = folderId ? `/folders/${folderId}` : '/';
  const presentHref = presentHrefFor(fileId, currentPageId, screens, currentScreenId);
  // Device presets do not apply to overlays (spec section 2) - the chip
  // itself would still work (setDevice just writes stageWidth/stageHeight/
  // deviceName the same as it does for a screen), but showing it invites
  // exactly the customization the spec rules out, so it is hidden outright
  // while an overlay frame is focused; width editing (the Mobile/Tablet/
  // Desktop segments and the resize handles) stays.
  const focusedScreen = screens.find((screen) => screen.id === currentScreenId);
  const focusedIsOverlay = focusedScreen ? isOverlay(focusedScreen) : false;

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
        <RenameFileField fileName={fileName} onRename={onRename} />
        <span className="font-mono text-[13px] text-muted-foreground" aria-hidden>
          ›
        </span>
        {!hidePageSelector && <PagesMenu
          pages={pages}
          currentPageId={currentPageId}
          screens={screens}
          onSwitch={onSwitchPage}
          onAdd={onAddPage}
          onRename={onRenamePage}
          onDuplicate={onDuplicatePage}
          onDelete={onDeletePage}
          onMove={onMovePage}
        />}
        {/*
          onAdd is onAddScreen (same action Shift+N triggers), not onNew:
          onNew opens the "Start a new frame?" dialog that clears the
          FOCUSED frame's own layout (the standalone "New frame" IconAction
          below, a pre-existing, unrelated feature) - the chip's own "New
          frame" menu item instead adds another screen to the page, per
          spec docs/superpowers/specs/2026-09-13-frames-chip-design.md
          section 1 ("the same actions the old chips' menus offered").
        */}
        <FramesChip
          frames={screens.filter((screen) => screen.pageId === currentPageId)}
          currentFrameId={currentScreenId}
          pages={pages}
          onSwitch={onSwitchScreen}
          onAdd={onAddScreen}
          onAddOverlay={onAddOverlay}
          onRename={onRenameScreen}
          onDuplicate={onDuplicateScreen}
          onDelete={onDeleteScreen}
          onMoveToPage={onMoveScreenToPage}
          onZoomToFrame={onZoomToFrame}
        />
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-[22px]" />
        <SegmentedControl
          aria-label="Frame width"
          value={preset ?? ''}
          onValueChange={(value) => {
            if (value) setPreset(value as StagePreset);
          }}
          className="w-auto"
        >
          {STAGE_PRESET_ORDER.map((key) => {
            const { label, icon: Icon } = PRESET_META[key];
            return (
              <SegmentedItem
                key={key}
                value={key}
                aria-label={label}
                title={`${STAGE_PRESETS[key]} px`}
                className="gap-1.5 px-3"
              >
                <Icon className="size-3.5" aria-hidden />
                <span className="hidden 2xl:inline">{label}</span>
              </SegmentedItem>
            );
          })}
        </SegmentedControl>
        {(!focusedIsOverlay || !frameSelected) && <DevicePresetMenu deviceName={frameSelected ? deviceName : null} onSelect={device => { if (!frameSelected && onCreateDeviceFrame) onCreateDeviceFrame(device); else setDevice(device); }} />}
        <ZoomMenu
          readoutText={readoutFor({ width, height, deviceName, zoom })}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomToFit={onZoomToFit}
          onZoomToSelection={onZoomToSelection}
        />
        <SaveIndicator saveState={saveState} notice={notice} />
        <div className="flex-1" />
        <NoteTool visible={notesVisible} onToggleVisibility={onToggleNotesVisibility} libraries active={commentMode} kind={noteKind} count={commentCount} onToggle={() => onToggleCommentMode?.()} onStart={kind => onStartNote?.(kind)} onBrowse={onBrowseNotes} />
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
        <Button variant="ghost" size="sm" onClick={() => window.dispatchEvent(new Event('dreamscape:writer'))}>Writer</Button>
        <a href={`/f/${fileId}/develop?screen=${encodeURIComponent(currentScreenId ?? '')}`} target="_blank" rel="noopener noreferrer" aria-label="Develop" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Develop</a>
        <SharePrototypeButton playHref={presentHref} screens={screens} pages={pages} currentScreenId={currentScreenId} />
        {onHandoff && <Button size="sm" onClick={onHandoff}>Handoff</Button>}
        <IconAction label="Undo" icon={Undo2} disabled={!(historyOverride?.canUndo ?? canUndo)} onClick={historyOverride?.undo ?? (() => actions.history.undo())} />
        <IconAction label="Redo" icon={Redo2} disabled={!(historyOverride?.canRedo ?? canRedo)} onClick={historyOverride?.redo ?? (() => actions.history.redo())} />
      </header>
    </TooltipProvider>
  );
}
