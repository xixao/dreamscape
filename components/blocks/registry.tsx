import { Element } from '@craftjs/core';
import {
  AlignLeft,
  AppWindow,
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
    type: 'Tabs',
    label: 'Tabs',
    hint: 'One content area for the active tab',
    icon: LayoutPanelTop,
    create: () => <Tabs />,
  },
  {
    type: 'Text',
    label: 'Text',
    hint: 'Heading, paragraph or caption',
    icon: Type,
    create: () => <Text />,
  },
  {
    type: 'Image',
    label: 'Image',
    hint: 'Placeholder image box',
    icon: ImageIcon,
    // eslint-disable-next-line jsx-a11y/alt-text -- this Image is the block above, not next/image's.
    create: () => <Image />,
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
    type: 'Textarea',
    label: 'Textarea',
    hint: 'Multi-line text input',
    icon: AlignLeft,
    create: () => <Textarea />,
  },
  {
    type: 'Select',
    label: 'Select',
    hint: 'Dropdown trigger',
    icon: ChevronsUpDown,
    create: () => <Select />,
  },
  {
    type: 'Checkbox',
    label: 'Checkbox',
    hint: 'Single checkbox with a label',
    icon: SquareCheck,
    create: () => <Checkbox />,
  },
  {
    type: 'RadioGroup',
    label: 'Radio group',
    hint: 'Radio options, one selected',
    icon: CircleDot,
    create: () => <RadioGroup />,
  },
  {
    type: 'Switch',
    label: 'Switch',
    hint: 'On or off toggle',
    icon: ToggleLeft,
    create: () => <Switch />,
  },
  {
    type: 'Slider',
    label: 'Slider',
    hint: 'Single value slider',
    icon: SlidersHorizontal,
    create: () => <Slider />,
  },
  {
    type: 'Badge',
    label: 'Badge',
    hint: 'Small status label',
    icon: Tag,
    create: () => <Badge />,
  },
  {
    type: 'Avatar',
    label: 'Avatar',
    hint: 'Initials in a circle',
    icon: CircleUserRound,
    create: () => <Avatar />,
  },
  {
    type: 'Alert',
    label: 'Alert',
    hint: 'Title and description banner',
    icon: TriangleAlert,
    create: () => <Alert />,
  },
  {
    type: 'Separator',
    label: 'Separator',
    hint: 'Horizontal or vertical divider',
    icon: SeparatorHorizontal,
    create: () => <Separator />,
  },
  {
    type: 'Progress',
    label: 'Progress',
    hint: 'Progress bar with an optional label',
    icon: GaugeCircle,
    create: () => <Progress />,
  },
  {
    type: 'Table',
    label: 'Table',
    hint: 'Header row and placeholder cells',
    icon: Table2,
    create: () => <Table />,
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
