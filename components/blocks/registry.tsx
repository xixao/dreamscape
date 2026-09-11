import { Element } from '@craftjs/core';
import { LayoutGrid, type LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { ROOT_LAYOUT_PROPS } from '@/lib/classes';
import { LayoutBox, layoutBoxSchema } from './layout-box';
import type { BlockSchema, BlockType } from './schema';

export const resolver = { LayoutBox };

export const KNOWN_TYPES: ReadonlySet<string> = new Set(Object.keys(resolver));

export const ZONE_TYPES: ReadonlySet<string> = new Set(['CardContent', 'DialogContent']);

export interface TrayItem {
  type: BlockType;
  label: string;
  hint: string;
  icon: LucideIcon;
  create: () => ReactElement;
}

export const trayItems: TrayItem[] = [
  {
    type: 'LayoutBox',
    label: 'Layout box',
    hint: 'Flex or grid container',
    icon: LayoutGrid,
    create: () => <Element is={LayoutBox} canvas />,
  },
];

const schemas: Partial<Record<string, BlockSchema>> = {
  LayoutBox: layoutBoxSchema,
};

export function schemaFor(type: string): BlockSchema | null {
  return schemas[type] ?? null;
}

export function emptyLayoutJson(): string {
  return JSON.stringify({
    ROOT: {
      type: { resolvedName: 'LayoutBox' },
      isCanvas: true,
      props: ROOT_LAYOUT_PROPS,
      displayName: 'LayoutBox',
      custom: {},
      hidden: false,
      nodes: [],
      linkedNodes: {},
      parent: null,
    },
  });
}
