'use client';

import { useState } from 'react';
import { useEditor } from '@craftjs/core';
import { Search } from 'lucide-react';
import { trayItems, type TrayGroup, type TrayItem } from '@/components/blocks/registry';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LABEL, SEARCH, SEARCH_INPUT } from './chrome';

// Render order for the group headings; within a group, trayItems' own order wins.
const GROUP_ORDER: readonly TrayGroup[] = ['Layout', 'Text and media', 'Forms', 'Feedback', 'Data'];

export function filterTrayItems(items: TrayItem[], query: string): TrayItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;
  return items.filter((item) =>
    [item.label, item.type].some((field) => field.toLowerCase().includes(trimmed)),
  );
}

// The Components tab's content: search field, grouped list, Craft drag
// sources (`connectors.create`). Rendered inside the right panel's own
// <aside> by Inspector, which already owns that panel's chrome and header
// (the Design/Prototype/Components tabs) - this renders no landmark or
// title of its own, so the two are never nested or duplicated (see
// docs/superpowers/specs/2026-09-12-panels-and-zoom-design.md section 1).
export function ComponentTray() {
  const { connectors } = useEditor();
  const [filter, setFilter] = useState('');
  const filteredItems = filterTrayItems(trayItems, filter);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pt-2">
        <div className={SEARCH}>
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search components"
            aria-label="Search components"
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
                    data-tray-item={item.type}
                    ref={(element) => {
                      if (element) connectors.create(element, item.create());
                    }}
                    className="flex cursor-grab items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-[border-color] duration-150 hover:border-line-strong hover:bg-accent active:cursor-grabbing"
                  >
                    <item.icon className="size-4 text-acc2" aria-hidden />
                    <span className="text-[13px] font-medium text-foreground">{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {filteredItems.length === 0 && (
        <p className="px-3 py-4 text-[12.5px] text-muted-foreground">No components match.</p>
      )}
    </div>
  );
}
