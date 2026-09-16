'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { detectPlatform, displayRows, formatKeys, type Platform, type ShortcutRow } from '@/lib/shortcuts';
import { OVERLAY_KEY_CAP, OVERLAY_TITLE } from './chrome';

const GROUPS = ['Editing', 'Selection', 'Components', 'Layout', 'Canvas', 'Panels', 'Pages & presentation', 'Diagrams', 'Chat', 'Help'];
function groupFor(row: ShortcutRow): string {
  const id = row.ids[0];
  if (id === 'create-custom-component' || id === 'detach-instance') return 'Components';
  if (id.startsWith('select-') || id === 'escape') return 'Selection';
  if (id.startsWith('align-') || id === 'wrap-in-frame') return 'Layout';
  if (id.startsWith('diagram-') && id !== 'diagram-duplicate' && !id.startsWith('diagram-nudge-')) return 'Diagrams';
  if (row.area === 'Screens' || row.area === 'Present') return 'Pages & presentation';
  if (row.area === 'Edit') return 'Editing';
  if (row.area === 'Tools') return 'Panels';
  return row.area;
}
function shortcutRows(): ShortcutRow[] {
  return [
    ...displayRows().filter(row => !row.ids.includes('tool-diagram')).map(row => row.ids.includes('diagram-nudge-up') ? { ...row, label: 'Move frames or diagram shapes (1 px)' } : row),
    { area: 'Edit', ids: ['layout-reorder'], keys: [['↑', '↓', '←', '→']], label: 'Reorder components in a row or column' },
    { area: 'Edit', ids: ['chat-history'], keys: [['↑'], ['↓']], label: 'Browse prompt history (empty message)' },
  ];
}
function ShortcutGroups({ platform, search }: { platform: Platform; search: string }) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const groups = GROUPS.map(area => ({ area, items: shortcutRows().filter(row => {
    const group = row.ids[0] === 'layout-reorder' ? 'Layout' : row.ids[0] === 'chat-history' ? 'Chat' : groupFor(row);
    const text = `${group} ${row.label} ${row.keys.flat().join(' ')} ${row.keys.map(keys => formatKeys(keys, platform)).join(' ')}`.toLowerCase();
    return group === area && terms.every(term => text.includes(term));
  }) })).filter(group => group.items.length);
  if (!groups.length) return <p role="status" className="py-12 text-center text-sm text-muted-foreground">No shortcuts found. Try “zoom”, “copy”, or “component”.</p>;
  return <div className="grid grid-cols-1 items-start gap-x-8 gap-y-7 md:grid-cols-2 xl:grid-cols-3">
    {groups.map(group => <section key={group.area} aria-label={group.area} className="min-w-0">
      <h3 className="mb-2 border-b border-line-soft pb-2 text-xs font-semibold text-muted-foreground">{group.area}</h3>
      <div className="space-y-1">{group.items.map(item => <div key={item.ids.join('+')} className="flex min-h-8 items-start justify-between gap-3 py-1">
        <span className="min-w-0 text-[13px] leading-5 text-t2">{item.label}</span>
        <span className="flex max-w-[55%] shrink-0 flex-wrap justify-end gap-1">{item.keys.map((keys, index) => <kbd key={index} className={OVERLAY_KEY_CAP}>{formatKeys(keys, platform)}</kbd>)}</span>
      </div>)}</div>
    </section>)}
  </div>;
}

/**
 * Every keyboard shortcut grouped by area, as a dialog that stays open until
 * Escape, the close button or an outside click. Opened by the top bar's ⌘
 * button, the overflow menu's "Keyboard shortcuts" item and the "?" key
 * (wired through `open`/`onOpenChange` by the workbench).
 *
 * There used to be a second, display-only presentation that appeared after
 * holding Cmd for 600 ms; Matt replaced it with the top bar button on
 * 2026-09-13 ("instead of the keyboard command to bring up the modal, just
 * put a command key icon in the top toolbar"), since it also surfaced in the
 * middle of every Cmd-modified gesture.
 */
export function ShortcutsOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Lazy initializer (same pattern as WorkbenchShell's own
  // loadPanelMode/getAuthorName calls): this component only ever mounts in
  // the browser, so reading navigator directly during the first render -
  // rather than syncing it in from an effect - needs no extra render pass.
  const [platform] = useState<Platform>(() => detectPlatform());
  const [search, setSearch] = useState('');

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) setSearch(''); onOpenChange(next); }}>
      <DialogContent className="z-[100] flex max-h-[85dvh] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden bg-card p-0 shadow-panel-lg sm:max-w-[1100px]">
        <DialogHeader className="shrink-0 gap-2 border-b border-line-soft px-6 pb-4 pt-5 text-left">
          <DialogTitle className={OVERLAY_TITLE}>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Canvas shortcuts work while designing. Text fields keep their normal editing controls.</DialogDescription>
          <input aria-label="Search shortcuts" placeholder="Search shortcuts…" value={search} onChange={event => setSearch(event.target.value)} className="mt-2 w-full rounded-md border border-line-soft bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-6" role="region" aria-label="Shortcut reference" tabIndex={0}>
          <ShortcutGroups platform={platform} search={search} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
