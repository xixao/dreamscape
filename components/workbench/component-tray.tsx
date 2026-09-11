'use client';

import { useEditor } from '@craftjs/core';
import { trayItems } from '@/components/blocks/registry';
import { cn } from '@/lib/utils';
import { PANEL, PANEL_HEADER, PANEL_TITLE } from './chrome';

export function ComponentTray() {
  const { connectors } = useEditor();

  return (
    <aside className={cn(PANEL, 'flex min-h-0 flex-col')}>
      <div className={PANEL_HEADER}>
        <span className={PANEL_TITLE}>Components</span>
      </div>
      <ul className="flex flex-col gap-1 overflow-y-auto p-2">
        {trayItems.map((item) => (
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
    </aside>
  );
}
