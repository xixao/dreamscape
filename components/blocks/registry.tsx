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
import { Button, buttonSchema } from './button';
import { Card, CardContent, cardSchema } from './card';
import { Dialog, DialogContent, dialogSchema } from './dialog';
import { Input, inputSchema } from './input';
import { LayoutBox, layoutBoxSchema } from './layout-box';
import type { BlockSchema, BlockType } from './schema';

export const resolver = { LayoutBox, Button, Input, Card, Dialog, CardContent, DialogContent };

// Server-only code (API route handlers, and any server component that
// reads a file's layout before mounting the Workbench) should import
// KNOWN_TYPES and emptyLayoutJson from ./known-types instead of from
// here: importing this module pulls in @craftjs/core, which breaks
// outside a React render (see known-types.ts for detail). This copy is
// re-derived from `resolver`, not imported from ./known-types, so the
// client tree never needs ./known-types either; known-types.test.ts
// keeps the two lists from drifting apart.
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

// Server-only code: import this from ./known-types instead (see the note
// on KNOWN_TYPES above). Re-exported here, rather than redefined, so the
// client tree's copy can never drift from the server-safe one.
export { emptyLayoutJson } from './known-types';
