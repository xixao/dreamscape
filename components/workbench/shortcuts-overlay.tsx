'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { detectPlatform, displayRows, formatKeys, type Platform, type ShortcutArea, type ShortcutRow } from '@/lib/shortcuts';
import {
  OVERLAY_CAPTION,
  OVERLAY_GRID,
  OVERLAY_GROUP_TITLE,
  OVERLAY_KEY_CAP,
  OVERLAY_ROW_LABEL,
  OVERLAY_SURFACE,
  OVERLAY_TITLE,
  WIDE_DIALOG_CONTENT,
} from './chrome';
import { isEditableTarget } from './keyboard';

// Spec docs/superpowers/specs/2026-09-12-shortcuts-overlay-design.md section
// 2: `keydown` of Meta (Mac) or Control (others) with no other key held
// starts a timer; any other keydown while it runs cancels it.
const HOLD_MS = 600;

// Display order for the grouped list - matches the Area column order in
// docs/superpowers/specs/2026-09-13-shortcuts-and-elements-design.md
// section 2, so the overlay and the README read the same way.
const AREA_ORDER: ShortcutArea[] = ['Panels', 'Present', 'Tools', 'Canvas', 'Screens', 'Edit', 'Help'];

function groupedShortcuts(): { area: ShortcutArea; items: ShortcutRow[] }[] {
  const rows = displayRows();
  return AREA_ORDER.map((area) => ({ area, items: rows.filter((row) => row.area === area) })).filter(
    (group) => group.items.length > 0,
  );
}

function isHoldModifierKey(event: KeyboardEvent, platform: Platform): boolean {
  return platform === 'mac' ? event.key === 'Meta' : event.key === 'Control';
}

// The grouped shortcut list itself - shared between the hold-triggered,
// display-only presentation and the "?"/overflow-menu dialog, so the two
// can never show different content (spec: "'?' ... open the same content as
// a dialog").
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
 * Holding Cmd (Meta on Mac, Control elsewhere) for 600ms shows every
 * keyboard shortcut grouped by area; releasing it, blurring the window, or
 * Escape hides it again. This presentation is display-only - it captures no
 * focus and no clicks (`pointer-events-none`) and never calls
 * `preventDefault`, so a real shortcut fired while it is showing still runs
 * exactly as if the overlay were not there.
 *
 * The same content also opens as a normal, focusable dialog through the
 * `open`/`onOpenChange` props (wired to the "?" shortcut and the top bar's
 * overflow menu), which stays open until Escape or an outside click, same
 * as any other dialog in the app.
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
  const [holdVisible, setHoldVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearPendingTimer(): void {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (isHoldModifierKey(event, platform)) {
        // A real keyboard never repeats a bare modifier keydown, but a
        // synthetic or unusual one might - starting a fresh 600ms timer on
        // every repeat would mean holding it down could never actually
        // reach 600ms of its own.
        if (event.repeat) return;
        // Never opens while a text field has focus or a menu/dialog owns
        // the interaction (same isEditableTarget guard as every other
        // shortcut).
        if (isEditableTarget(event.target)) return;
        clearPendingTimer();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setHoldVisible(true);
        }, HOLD_MS);
        return;
      }

      if (event.key === 'Escape') {
        clearPendingTimer();
        setHoldVisible(false);
        return;
      }

      // Any other keydown while the timer is still pending cancels it, so a
      // combo (Cmd+Z, say) never shows the overlay. An already-visible
      // overlay is left alone here - nothing is pending to cancel, and
      // "shortcuts fired during the hold still run" applies to this overlay
      // too: it keeps showing while the rest of the app keeps working.
      clearPendingTimer();
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (!isHoldModifierKey(event, platform)) return;
      clearPendingTimer();
      setHoldVisible(false);
    }

    function onBlur(): void {
      clearPendingTimer();
      setHoldVisible(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      clearPendingTimer();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [platform]);

  if (open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* WIDE_DIALOG_CONTENT carries the same-variant `sm:max-w-*` override
        that shadcn's own `sm:max-w-sm` needs (see its comment in chrome.ts),
        shared with the Element documentation dialog so the two stay the
        same size. */}
        <DialogContent className={WIDE_DIALOG_CONTENT}>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <ShortcutGroups platform={platform} />
        </DialogContent>
      </Dialog>
    );
  }

  if (!holdVisible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={OVERLAY_SURFACE}>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className={OVERLAY_TITLE}>Keyboard shortcuts</h2>
          <span className={OVERLAY_CAPTION}>Release {platform === 'mac' ? '⌘' : 'Ctrl'} to close</span>
        </div>
        <ShortcutGroups platform={platform} />
      </div>
    </div>
  );
}
