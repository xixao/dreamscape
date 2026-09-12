'use client';

import { useState } from 'react';
import { useEditor } from '@craftjs/core';
import { Search } from 'lucide-react';
import { trayItems, type TrayItem } from '@/components/blocks/registry';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PANEL, PANEL_HEADER, PANEL_TITLE, SEARCH, SEARCH_INPUT } from './chrome';

export function filterTrayItems(items: TrayItem[], query: string): TrayItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;
  return items.filter((item) =>
    [item.label, item.hint, item.type].some((field) => field.toLowerCase().includes(trimmed)),
  );
}

export function ComponentTray() {
  const { connectors } = useEditor();
  const [filter, setFilter] = useState('');
  const filteredItems = filterTrayItems(trayItems, filter);

  return (
    <aside aria-label="Assets" className={cn(PANEL, 'flex min-h-0 flex-col')}>
      <div className={PANEL_HEADER}>
        <span className={PANEL_TITLE}>Assets</span>
      </div>
      <div className="px-2 pt-2">
        <div className={SEARCH}>
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search assets"
            aria-label="Search assets"
            className={SEARCH_INPUT}
          />
        </div>
      </div>
      <ul className="flex flex-col gap-1 overflow-y-auto p-2">
        {filteredItems.map((item) => (
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
            <span className="ml-auto font-mono text-[10.5px] text-t4">{item.hint}</span>
          </li>
        ))}
      </ul>
      {filteredItems.length === 0 && (
        <p className="px-3 py-4 text-[12.5px] text-muted-foreground">No assets match.</p>
      )}
    </aside>
  );
}
