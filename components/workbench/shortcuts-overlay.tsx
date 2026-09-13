'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { detectPlatform, displayRows, formatKeys, type Platform, type ShortcutArea, type ShortcutRow } from '@/lib/shortcuts';
import { OVERLAY_GRID, OVERLAY_GROUP_TITLE, OVERLAY_KEY_CAP, OVERLAY_ROW_LABEL, OVERLAY_TITLE, WIDE_DIALOG_CONTENT } from './chrome';

// Display order for the grouped list - matches the Area column order in
// docs/superpowers/specs/2026-09-13-shortcuts-and-elements-design.md
// section 2, so the dialog and the README read the same way.
const AREA_ORDER: ShortcutArea[] = ['Panels', 'Present', 'Tools', 'Canvas', 'Screens', 'Edit', 'Help'];

function groupedShortcuts(): { area: ShortcutArea; items: ShortcutRow[] }[] {
  const rows = displayRows();
  return AREA_ORDER.map((area) => ({ area, items: rows.filter((row) => row.area === area) })).filter(
    (group) => group.items.length > 0,
  );
}

function ShortcutGroups({ platform }: { platform: Platform }) {
  return (
    <div className={OVERLAY_GRID}>
      {groupedShortcuts().map((group) => (
        <div key={group.area}>
          <h3 className={OVERLAY_GROUP_TITLE}>{group.area}</h3>
          <div className="flex flex-col gap-1.5">
            {group.items.map((item: ShortcutRow) => (
              <div key={item.ids.join('+')} className="flex items-center justify-between gap-6">
                <span className={OVERLAY_ROW_LABEL}>{item.label}</span>
                <span className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                  {item.keys.map((keys, index) => (
                    <span key={item.ids[index] ?? index} className={OVERLAY_KEY_CAP}>
                      {formatKeys(keys, platform)}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
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

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* WIDE_DIALOG_CONTENT carries the same-variant `sm:max-w-*` override
      that shadcn's own `sm:max-w-sm` needs (see its comment in chrome.ts),
      shared with the Element documentation dialog so the two stay the same
      size. */}
      <DialogContent className={WIDE_DIALOG_CONTENT}>
        <DialogHeader>
          {/* OVERLAY_TITLE, the same 20px treatment as the Element
          documentation dialog's title. */}
          <DialogTitle className={OVERLAY_TITLE}>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ShortcutGroups platform={platform} />
      </DialogContent>
    </Dialog>
  );
}
