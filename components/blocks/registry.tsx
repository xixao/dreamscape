import { Element } from '@craftjs/core';
import {
  AppWindow,
  LayoutGrid,
  MousePointerClick,
  RectangleHorizontal,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { ROOT_LAYOUT_PROPS } from '@/lib/classes';
import { Button, buttonSchema } from './button';
import { Card, CardContent, cardSchema } from './card';
import { Dialog, DialogContent, dialogSchema } from './dialog';
import { Input, inputSchema } from './input';
import { LayoutBox, layoutBoxSchema } from './layout-box';
import type { BlockSchema, BlockType } from './schema';

export const resolver = { LayoutBox, Button, Input, Card, Dialog, CardContent, DialogContent };

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
    label: 'Frame',
    hint: 'Auto layout container',
    icon: LayoutGrid,
    create: () => <Element is={LayoutBox} canvas />,
  },
  {
    type: 'Card',
    label: 'Card',
    hint: 'Header and content area',
    icon: RectangleHorizontal,
    create: () => <Card />,
  },
  {
    type: 'Button',
    label: 'Button',
    hint: 'shadcn Button',
    icon: MousePointerClick,
    create: () => <Button />,
  },
  {
    type: 'Input',
    label: 'Input',
    hint: 'shadcn Input with label',
    icon: TextCursorInput,
    create: () => <Input />,
  },
  {
    type: 'Dialog',
    label: 'Dialog',
    hint: 'Trigger and content',
    icon: AppWindow,
    create: () => <Dialog />,
  },
];

const schemas: Partial<Record<string, BlockSchema>> = {
  LayoutBox: layoutBoxSchema,
  Button: buttonSchema,
  Input: inputSchema,
  Card: cardSchema,
  Dialog: dialogSchema,
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
