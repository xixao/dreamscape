'use client';

import { useRef, useState } from 'react';
import { useEditor } from '@craftjs/core';
import { Info, Search } from 'lucide-react';
import { trayItems, type TrayGroup, type TrayItem } from '@/components/blocks/registry';
import type { BlockType } from '@/components/blocks/schema';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LABEL, SEARCH, SEARCH_INPUT } from './chrome';
import { ElementDocsDialog } from './element-docs-dialog';

// Render order for the group headings; within a group, trayItems' own order wins.
const GROUP_ORDER: readonly TrayGroup[] = ['Layout', 'Text and media', 'Forms', 'Feedback', 'Data'];

// The row's "i" button (spec docs/superpowers/specs/2026-09-13-element-docs-
// design.md section 1): invisible until the row is hovered or something in
// it has focus, but always in the tab order, so a keyboard user reaches it
// with Tab and sees it appear.
const INFO_BUTTON =
  'mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover:opacity-100 group-focus-within:opacity-100';

export function filterTrayItems(items: TrayItem[], query: string): TrayItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;
  return items.filter((item) =>
    [item.label, item.type, ...(item.keywords ?? [])].some((field) => field.toLowerCase().includes(trimmed)),
  );
}

// The Elements tab's content: search field, grouped list, Craft drag
// sources (`connectors.create`). Rendered inside the right panel's own
// <aside> by Inspector, which already owns that panel's chrome and header
// (the Design/Prototype/Elements tabs) - this renders no landmark or
// title of its own, so the two are never nested or duplicated (see
// docs/superpowers/specs/2026-09-12-panels-and-zoom-design.md section 1).
export function ComponentTray() {
  const { connectors } = useEditor();
  const [filter, setFilter] = useState('');
  // One Element documentation dialog for the whole tray. The type outlives
  // `open` so the dialog's closing animation keeps showing the element it
  // was opened for instead of flashing the fallback doc.
  const [docsType, setDocsType] = useState<BlockType | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  // The "i" button that opened the dialog; the dialog returns focus to it
  // when it closes (see ElementDocsDialog's openerRef).
  const docsOpenerRef = useRef<HTMLElement | null>(null);
  const filteredItems = filterTrayItems(trayItems, filter);

  function openDocs(type: BlockType, opener: HTMLElement): void {
    docsOpenerRef.current = opener;
    setDocsType(type);
    setDocsOpen(true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pt-2">
        <div className={SEARCH}>
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search elements"
            aria-label="Search elements"
            className={SEARCH_INPUT}
          />
        </div>
      </div>
      <div className="flex flex-col overflow-y-auto pb-2">
        {GROUP_ORDER.map((group) => {
          const items = filteredItems.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} data-tray-section={group}>
              <div data-tray-group={group} className={cn(LABEL, 'px-3 pt-3 pb-1')}>
                {group}
              </div>
              <ul className="flex flex-col gap-1 px-2">
                {items.map((item) => (
                  <li
                    key={item.type}
                    className="group flex items-center rounded-lg border border-transparent transition-[border-color] duration-150 hover:border-line-strong hover:bg-accent focus-within:border-line-strong focus-within:bg-accent"
                  >
                    {/* The drag surface: connectors.create marks it draggable
                    and attaches Craft's native dragstart/dragend listeners,
                    and data-tray-item sits on this exact element so a raw
                    dragstart on it names the TrayItem (drop-placeholder.tsx).
                    The "i" button below is its sibling, not a descendant -
                    an HTML drag starts from the nearest draggable ancestor
                    of the pointer, so a press on the button can never become
                    this item's drag. */}
                    <div
                      data-tray-item={item.type}
                      ref={(element) => {
                        if (element) connectors.create(element, item.create());
                      }}
                      className="flex min-w-0 flex-1 cursor-grab items-center gap-3 py-2 pr-2 pl-3 active:cursor-grabbing"
                    >
                      <item.icon className="size-4 shrink-0 text-acc2" aria-hidden />
                      <span className="text-[13px] font-medium text-foreground">{item.label}</span>
                    </div>
                    {/* The press bubbles like any other: the layer stack
                    menu dismisses on a document click and Radix's non-modal
                    layers detect outside presses the same way, so no
                    stopPropagation here. Being outside the drag surface is
                    what keeps it from starting a drag. */}
                    <button
                      type="button"
                      aria-label={`About ${item.label}`}
                      draggable={false}
                      className={INFO_BUTTON}
                      onClick={(event) => openDocs(item.type, event.currentTarget)}
                    >
                      <Info className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {filteredItems.length === 0 && (
        <p className="px-3 py-4 text-[12.5px] text-muted-foreground">No elements match.</p>
      )}
      {/* Follow-up (after the grid merge, which owns workbench.tsx): hoist
      this beside ShortcutsOverlay in WorkbenchShell, with the tray taking an
      onShowDocs(type, opener) prop. Cmd+\ (toggle-ui, `always: true`) hides
      every panel including this tray, so while the dialog is open it
      unmounts mid-open: no exit animation, and focus lands on <body>
      because the opener is detached. Radix's cleanups clear the modal
      state, which component-tray.test.tsx pins. */}
      {docsType !== null && (
        <ElementDocsDialog type={docsType} open={docsOpen} onOpenChange={setDocsOpen} openerRef={docsOpenerRef} />
      )}
    </div>
  );
}
