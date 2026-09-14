import { Element } from '@craftjs/core';
import {
  AlignLeft,
  ChevronsUpDown,
  CircleDot,
  CircleUserRound,
  GaugeCircle,
  Image as ImageIcon,
  LayoutGrid,
  LayoutPanelTop,
  MousePointerClick,
  RectangleHorizontal,
  SeparatorHorizontal,
  SlidersHorizontal,
  SquareCheck,
  Table2,
  Tag,
  TextCursorInput,
  ToggleLeft,
  TriangleAlert,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Alert, alertSchema } from './alert';
import { Avatar, avatarSchema } from './avatar';
import { Badge, badgeSchema } from './badge';
import { Button, buttonSchema } from './button';
import { Card, CardContent, cardSchema } from './card';
import { Checkbox, checkboxSchema } from './checkbox';
import { Dialog, DialogContent, dialogSchema } from './dialog';
import { Image, imageSchema } from './image';
import { Input, inputSchema } from './input';
import { LayoutBox, layoutBoxSchema } from './layout-box';
import { Progress, progressSchema } from './progress';
import { RadioGroup, radioGroupSchema } from './radio-group';
import { Select, selectSchema } from './select';
import { Separator, separatorSchema } from './separator';
import { Slider, sliderSchema } from './slider';
import { Switch, switchSchema } from './switch';
import { Table, tableSchema } from './table';
import { Tabs, TabsContent, tabsSchema } from './tabs';
import { Text, textSchema } from './text';
import { Textarea, textareaSchema } from './textarea';
import type { BlockSchema, BlockType } from './schema';

export const resolver = {
  LayoutBox,
  Button,
  Input,
  Card,
  Dialog,
  CardContent,
  DialogContent,
  Text,
  Image,
  Textarea,
  Select,
  Checkbox,
  RadioGroup,
  Switch,
  Slider,
  Badge,
  Avatar,
  Alert,
  Separator,
  Progress,
  Tabs,
  TabsContent,
  Table,
};

// Server-only code (API route handlers, and any server component that
// reads a file's layout before mounting the Workbench) should import
// KNOWN_TYPES and emptyLayoutJson from ./known-types instead of from
// here: importing this module pulls in @craftjs/core, which breaks
// outside a React render (see known-types.ts for detail). This copy is
// re-derived from `resolver`, not imported from ./known-types, so the
// client tree never needs ./known-types either; known-types.test.ts
// keeps the two lists from drifting apart.
export const KNOWN_TYPES: ReadonlySet<string> = new Set(Object.keys(resolver));

export const ZONE_TYPES: ReadonlySet<string> = new Set(['CardContent', 'DialogContent', 'TabsContent']);

export type TrayGroup = 'Layout' | 'Text and media' | 'Forms' | 'Feedback' | 'Data';

export interface TrayItem {
  type: BlockType;
  label: string;
  group: TrayGroup;
  icon: LucideIcon;
  create: () => ReactElement;
  // The drag placeholder's (docs/superpowers/specs/2026-09-12-drop-
  // placeholder-design.md) size hint for a NEW instance of this block, read
  // by lib/drop-placeholder.ts's placeholderSize: a rough guess at this
  // block's own default rendered size, not a contract - the block's real
  // size once dropped can differ (a Card's height depends on its content, a
  // Button's width on its label). Every current tray item has one; a
  // future item without one falls back to placeholderSize's own
  // 40px-tall/full-width default.
  previewSize?: { width: number; height: number };
  // Extra words the Elements search matches besides the label and type,
  // for the names designers actually use (Matt, 2026-09-13: "why is modal
  // not a component in the list?" - it is, as shadcn's "Dialog").
  keywords?: string[];
}

// Order matters: within a group, items render in this array's order (see
// component-tray.tsx, which groups by `group` without re-sorting).
export const trayItems: TrayItem[] = [
  // Layout
  {
    type: 'LayoutBox',
    label: 'Frame',
    group: 'Layout',
    icon: LayoutGrid,
    create: () => <Element is={LayoutBox} canvas />,
    previewSize: { width: 320, height: 120 },
  },
  {
    type: 'Card',
    label: 'Card',
    group: 'Layout',
    icon: RectangleHorizontal,
    create: () => <Card />,
    previewSize: { width: 320, height: 180 },
  },
  {
    type: 'Tabs',
    label: 'Tabs',
    group: 'Layout',
    icon: LayoutPanelTop,
    create: () => <Tabs />,
    previewSize: { width: 320, height: 120 },
  },
  {
    type: 'Separator',
    label: 'Separator',
    group: 'Layout',
    icon: SeparatorHorizontal,
    create: () => <Separator />,
    previewSize: { width: 240, height: 1 },
  },
  // Text and media
  {
    type: 'Text',
    label: 'Text',
    group: 'Text and media',
    icon: Type,
    create: () => <Text />,
    previewSize: { width: 200, height: 24 },
  },
  {
    type: 'Image',
    label: 'Image',
    group: 'Text and media',
    icon: ImageIcon,
    // eslint-disable-next-line jsx-a11y/alt-text -- this Image is the block above, not next/image's.
    create: () => <Image />,
    previewSize: { width: 320, height: 180 },
  },
  {
    type: 'Avatar',
    label: 'Avatar',
    group: 'Text and media',
    icon: CircleUserRound,
    create: () => <Avatar />,
    previewSize: { width: 40, height: 40 },
  },
  {
    type: 'Badge',
    label: 'Badge',
    group: 'Text and media',
    icon: Tag,
    create: () => <Badge />,
    previewSize: { width: 64, height: 22 },
  },
  // Forms
  {
    type: 'Button',
    label: 'Button',
    group: 'Forms',
    icon: MousePointerClick,
    create: () => <Button />,
    previewSize: { width: 120, height: 36 },
  },
  {
    type: 'Input',
    label: 'Input',
    group: 'Forms',
    icon: TextCursorInput,
    create: () => <Input />,
    previewSize: { width: 240, height: 60 },
  },
  {
    type: 'Textarea',
    label: 'Textarea',
    group: 'Forms',
    icon: AlignLeft,
    create: () => <Textarea />,
    previewSize: { width: 240, height: 96 },
  },
  {
    type: 'Select',
    label: 'Select',
    group: 'Forms',
    icon: ChevronsUpDown,
    create: () => <Select />,
    previewSize: { width: 240, height: 60 },
  },
  {
    type: 'Checkbox',
    label: 'Checkbox',
    group: 'Forms',
    icon: SquareCheck,
    create: () => <Checkbox />,
    previewSize: { width: 160, height: 24 },
  },
  {
    type: 'RadioGroup',
    label: 'Radio group',
    group: 'Forms',
    icon: CircleDot,
    create: () => <RadioGroup />,
    previewSize: { width: 160, height: 72 },
  },
  {
    type: 'Switch',
    label: 'Switch',
    group: 'Forms',
    icon: ToggleLeft,
    create: () => <Switch />,
    previewSize: { width: 160, height: 24 },
  },
  {
    type: 'Slider',
    label: 'Slider',
    group: 'Forms',
    icon: SlidersHorizontal,
    create: () => <Slider />,
    previewSize: { width: 240, height: 24 },
  },
  // Feedback
  {
    type: 'Alert',
    label: 'Alert',
    group: 'Feedback',
    icon: TriangleAlert,
    create: () => <Alert />,
    previewSize: { width: 320, height: 64 },
  },
  {
    type: 'Progress',
    label: 'Progress',
    group: 'Feedback',
    icon: GaugeCircle,
    create: () => <Progress />,
    previewSize: { width: 240, height: 16 },
  },
  // Dialog removed from the tray (spec docs/superpowers/specs/2026-09-13-
  // overlay-frames-design.md section 5, phase 2): a modal is now an
  // overlay frame (Frames chip -> New overlay -> Dialog), not a block
  // designed inline. Stays in `resolver`/`schemas` below (imported above)
  // so an existing layout that already has one keeps rendering and keeps
  // its "Open dialog..." interaction - only removed from this list, which
  // is what the Elements tray and the drag/docs machinery that reads it
  // (component-tray.tsx, layer-stack-menu.tsx, drop-placeholder.tsx,
  // element-docs-dialog.tsx) actually iterate. component-tray.tsx shows a
  // hint pointing at the Frames chip when a search for "modal"/"popup"/
  // "overlay"/"dialog" finds nothing here.
  // Data
  {
    type: 'Table',
    label: 'Table',
    group: 'Data',
    icon: Table2,
    create: () => <Table />,
    previewSize: { width: 480, height: 160 },
  },
];

const schemas: Partial<Record<string, BlockSchema>> = {
  LayoutBox: layoutBoxSchema,
  Button: buttonSchema,
  Input: inputSchema,
  Card: cardSchema,
  Dialog: dialogSchema,
  Text: textSchema,
  Image: imageSchema,
  Textarea: textareaSchema,
  Select: selectSchema,
  Checkbox: checkboxSchema,
  RadioGroup: radioGroupSchema,
  Switch: switchSchema,
  Slider: sliderSchema,
  Badge: badgeSchema,
  Avatar: avatarSchema,
  Alert: alertSchema,
  Separator: separatorSchema,
  Progress: progressSchema,
  Tabs: tabsSchema,
  Table: tableSchema,
};

export function schemaFor(type: string): BlockSchema | null {
  return schemas[type] ?? null;
}

// Server-only code: import this from ./known-types instead (see the note
// on KNOWN_TYPES above). Re-exported here, rather than redefined, so the
// client tree's copy can never drift from the server-safe one.
export { emptyLayoutJson } from './known-types';
