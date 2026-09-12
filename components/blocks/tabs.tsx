import { Element, useNode, type UserComponent } from '@craftjs/core';
import type { ReactNode } from 'react';
import { Tabs as UiTabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { parseList } from '@/lib/lists';
import { cn } from '@/lib/utils';
import { DropZone } from './drop-zone';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface TabsBlockProps extends GrowProps {
  tabs: string;
  active: 1 | 2 | 3;
}

export const TABS_DEFAULTS: TabsBlockProps = {
  tabs: 'Overview, Details, Settings',
  active: 1,
  grow: false,
};

/** Clamps the 1-based `active` index to a valid tab, defaulting to the first one. */
function activeLabel(tabs: readonly string[], active: number): string {
  if (tabs.length === 0) return '';
  const index = Math.min(Math.max(active, 1), tabs.length) - 1;
  return tabs[index];
}

// Only one content zone exists in v1, for whichever tab is active; switching
// tabs is not interactive yet (the Components panel groups it under Layout). The triggers are
// pointer-events-none so clicking the tab bar selects the block.
export const TabsContent: UserComponent<{ children?: ReactNode }> = ({ children }) => {
  const {
    connectors: { connect },
    childCount,
  } = useNode((node) => ({ childCount: node.data.nodes.length }));

  return (
    <div
      ref={(element) => {
        if (element) connect(element);
      }}
      data-zone="TabsContent"
      className="flex flex-col gap-4"
    >
      {childCount === 0 ? <DropZone /> : children}
    </div>
  );
};

TabsContent.craft = {
  displayName: 'TabsContent',
  rules: {
    canDrag: () => false,
  },
};

export const Tabs: UserComponent<Partial<TabsBlockProps>> = (props) => {
  const merged: TabsBlockProps = { ...TABS_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();
  const tabs = parseList(merged.tabs);
  const active = activeLabel(tabs, merged.active);

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Tabs"
      className={cn('flex flex-col gap-3', blockClasses(merged))}
    >
      <UiTabs value={active}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab} tabIndex={-1} className="pointer-events-none">
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>
      </UiTabs>
      <Element id="content" is={TabsContent} canvas />
    </div>
  );
};

Tabs.craft = {
  displayName: 'Tabs',
  props: TABS_DEFAULTS,
};

export const tabsSchema: BlockSchema = {
  type: 'Tabs',
  fields: [
    { prop: 'tabs', label: 'Tabs', kind: 'text', section: 'Content' },
    {
      prop: 'active',
      label: 'Active tab',
      kind: 'select',
      section: 'Content',
      options: [1, 2, 3].map((value) => ({ value, label: String(value) })),
    },
    GROW_FIELD,
  ],
};
