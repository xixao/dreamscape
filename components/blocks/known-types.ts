import { nanoid } from 'nanoid';
import { ROOT_LAYOUT_PROPS } from '@/lib/classes';

/**
 * The block type names the workbench can resolve, plus the empty-layout
 * seed, kept independent of registry.tsx's component implementations.
 *
 * registry.tsx imports @craftjs/core and the shadcn/Radix-based block
 * components (Button, Card, Dialog, ...), which is fine for the
 * client-only Workbench (mounted with `ssr: false`) but breaks when
 * pulled into a module Next.js loads outside any React render, such as a
 * Route Handler: @craftjs/core's own module-scope `createContext` call
 * fails under Next's server bundling for that context ("X.createContext
 * is not a function" while "Collecting page data"). Server-only code
 * (route handlers, and any server component that reads a file's layout
 * before mounting the Workbench) should import KNOWN_TYPES and
 * emptyLayoutJson from here, not from registry.tsx, even though
 * registry.tsx re-exports its own copy for the client tree.
 *
 * known-types.test.ts asserts this list matches registry.tsx's resolver
 * keys exactly, so the two cannot silently drift apart.
 */
const KNOWN_TYPE_NAMES = [
  'CustomComponent',
  'LayoutBox',
  'Button',
  'Input',
  'Card',
  'Dialog',
  'CardContent',
  'DialogContent',
  'Text',
  'Image',
  'Textarea',
  'Select',
  'Checkbox',
  'RadioGroup',
  'Switch',
  'Slider',
  'Badge',
  'Avatar',
  'Alert',
  'Separator',
  'Progress',
  'Tabs',
  'TabsContent',
  'Table',
] as const;

export const KNOWN_TYPES: ReadonlySet<string> = new Set(KNOWN_TYPE_NAMES);

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

/**
 * Builds the one screen a brand-new file starts with: an empty canvas named
 * "Frame 1" at the default 1440px desktop width. Kept here (rather than in
 * lib/files/repository.ts) so both the repository's create() and any other
 * dependency-free caller can mint a screen without reaching into
 * registry.tsx - see the module comment above for why that import boundary
 * matters. A fresh nanoid(10) every call: two default screens created back
 * to back must not collide.
 */
export function defaultScreen(name = 'Frame 1'): { id: string; name: string; layout: string; stageWidth: number } {
  return { id: nanoid(10), name, layout: emptyLayoutJson(), stageWidth: 1440 };
}
