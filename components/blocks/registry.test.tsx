import { describe, expect, it } from 'vitest';
import { LAYOUT_BOX_DEFAULTS, ROOT_LAYOUT_PROPS } from '@/lib/classes';
import { isResponsive } from '@/lib/responsive';
import {
  KNOWN_TYPES,
  ZONE_TYPES,
  emptyLayoutJson,
  resolver,
  schemaFor,
  trayItems,
  type TrayGroup,
} from './registry';
import type { BlockType } from './schema';

const BLOCK_TYPES: BlockType[] = [
  'LayoutBox',
  'Card',
  'Tabs',
  'Separator',
  'Text',
  'Image',
  'Avatar',
  'Badge',
  'Button',
  'Input',
  'Textarea',
  'Select',
  'Checkbox',
  'RadioGroup',
  'Switch',
  'Slider',
  'Alert',
  'Progress',
  'Dialog',
  'Table',
];

// Dialog stays a real, schema'd block type (BLOCK_TYPES above, for the
// resolver/schema tests below) but leaves the tray itself (spec docs/
// superpowers/specs/2026-09-13-overlay-frames-design.md section 5, phase
// 2: a modal is an overlay frame now) - registry.tsx keeps it in
// resolver/schemas so an existing layout that already has one keeps
// rendering, just no longer offered from the Elements tray.
const TRAY_ORDER: BlockType[] = BLOCK_TYPES.filter((type) => type !== 'Dialog');

const GROUPS: readonly TrayGroup[] = ['Layout', 'Text and media', 'Forms', 'Feedback', 'Data'];

describe('registry', () => {
  it('resolves every block and every zone', () => {
    expect([...KNOWN_TYPES].sort()).toEqual(
      [
        'Alert',
        'Avatar',
        'Badge',
        'Button',
        'Card',
        'CardContent',
        'Checkbox',
        'CustomComponent',
        'Dialog',
        'DialogContent',
        'Image',
        'Input',
        'LayoutBox',
        'Progress',
        'RadioGroup',
        'Select',
        'Separator',
        'Slider',
        'Switch',
        'Table',
        'Tabs',
        'TabsContent',
        'Text',
        'Textarea',
      ].sort(),
    );
    expect([...ZONE_TYPES].sort()).toEqual(['CardContent', 'DialogContent', 'TabsContent'].sort());
  });

  it('has one tray item per block type, in the spec order', () => {
    expect(trayItems.map((item) => item.type)).toEqual(TRAY_ORDER);
  });

  it('gives every tray item a label, a valid group and an icon', () => {
    for (const item of trayItems) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(GROUPS).toContain(item.group);
      expect(item.icon).toBeTruthy();
    }
  });

  it('groups tray items as Layout, Text and media, Forms, Feedback and Data, in that within-group order', () => {
    const byGroup = (group: TrayGroup) =>
      trayItems.filter((item) => item.group === group).map((item) => item.type);

    expect(byGroup('Layout')).toEqual(['LayoutBox', 'Card', 'Tabs', 'Separator']);
    expect(byGroup('Text and media')).toEqual(['Text', 'Image', 'Avatar', 'Badge']);
    expect(byGroup('Forms')).toEqual([
      'Button',
      'Input',
      'Textarea',
      'Select',
      'Checkbox',
      'RadioGroup',
      'Switch',
      'Slider',
    ]);
    expect(byGroup('Feedback')).toEqual(['Alert', 'Progress']);
    expect(byGroup('Data')).toEqual(['Table']);

    // Every item belongs to exactly one of the five groups above.
    const grouped = GROUPS.flatMap(byGroup);
    expect([...grouped].sort()).toEqual(trayItems.map((item) => item.type).sort());
  });

  it('labels RadioGroup, Text, Image, Tabs and Table in plain words', () => {
    const labelFor = (type: BlockType) => trayItems.find((item) => item.type === type)?.label;
    expect(labelFor('RadioGroup')).toBe('Radio group');
    expect(labelFor('Text')).toBe('Text');
    expect(labelFor('Image')).toBe('Image');
    expect(labelFor('Tabs')).toBe('Tabs');
    expect(labelFor('Table')).toBe('Table');
  });

  it('has a schema for every block whose props exist in the block defaults', () => {
    for (const type of BLOCK_TYPES) {
      const schema = schemaFor(type);
      expect(schema?.type).toBe(type);
      const defaults = (resolver[type] as { craft?: { props?: Record<string, unknown> } }).craft?.props ?? {};
      for (const field of schema!.fields) {
        expect(defaults).toHaveProperty(field.prop);
        if (field.responsive) expect(isResponsive(defaults[field.prop])).toBe(true);
        if (field.kind === 'select') expect(field.options?.length).toBeGreaterThan(1);
      }
    }
    expect(schemaFor('CardContent')).toBeNull();
    expect(schemaFor('DialogContent')).toBeNull();
    expect(schemaFor('TabsContent')).toBeNull();
    expect(schemaFor('Nope')).toBeNull();
  });

  it('hides columns unless the box is a grid, and direction unless it is flex', () => {
    const fields = schemaFor('LayoutBox')!.fields;
    const columns = fields.find((f) => f.prop === 'columns')!;
    const direction = fields.find((f) => f.prop === 'direction')!;
    expect(columns.showWhen?.({ ...LAYOUT_BOX_DEFAULTS, mode: 'grid' })).toBe(true);
    expect(columns.showWhen?.({ ...LAYOUT_BOX_DEFAULTS, mode: 'flex' })).toBe(false);
    expect(direction.showWhen?.({ ...LAYOUT_BOX_DEFAULTS, mode: 'grid' })).toBe(false);
    expect(direction.showWhen?.({ ...LAYOUT_BOX_DEFAULTS, mode: 'flex' })).toBe(true);
  });

  it('gives the LayoutBox schema a Gap and a Padding field on the 8 px scale', () => {
    const fields = schemaFor('LayoutBox')!.fields;
    const gap = fields.find((f) => f.prop === 'gapPx')!;
    const padding = fields.find((f) => f.prop === 'paddingPx')!;
    expect(gap.label).toBe('Gap');
    expect(padding.label).toBe('Padding');
    for (const field of [gap, padding]) {
      expect(field.options).toHaveLength(9);
      expect(field.options?.[0]).toEqual({ value: 0, label: '0 px' });
      expect(field.options?.[1]).toEqual({ value: 8, label: '8 px' });
      expect(field.options?.[8]).toEqual({ value: 64, label: '64 px' });
    }
  });

  it('marks previewOpen as editor-only', () => {
    const previewOpen = schemaFor('Dialog')!.fields.find((f) => f.prop === 'previewOpen');
    expect(previewOpen?.editorOnly).toBe(true);
    expect(previewOpen?.section).toBe('Editor');
  });

  // The drag placeholder (docs/superpowers/specs/2026-09-12-drop-placeholder-
  // design.md section 3) sizes a new-component placeholder from this hint,
  // falling back to lib/drop-placeholder.ts's own FALLBACK_HEIGHT/full width
  // for any tray item that has none - every current one does.
  it('gives every tray item a previewSize hint matching the spec', () => {
    const expected: Record<BlockType, { width: number; height: number }> = {
      LayoutBox: { width: 320, height: 120 },
      Card: { width: 320, height: 180 },
      Tabs: { width: 320, height: 120 },
      Separator: { width: 240, height: 1 },
      Text: { width: 200, height: 24 },
      Image: { width: 320, height: 180 },
      Avatar: { width: 40, height: 40 },
      Badge: { width: 64, height: 22 },
      Button: { width: 120, height: 36 },
      Input: { width: 240, height: 60 },
      Textarea: { width: 240, height: 96 },
      Select: { width: 240, height: 60 },
      Checkbox: { width: 160, height: 24 },
      RadioGroup: { width: 160, height: 72 },
      Switch: { width: 160, height: 24 },
      Slider: { width: 240, height: 24 },
      Alert: { width: 320, height: 64 },
      Progress: { width: 240, height: 16 },
      Dialog: { width: 120, height: 36 },
      Table: { width: 480, height: 160 },
    };
    // TRAY_ORDER, not BLOCK_TYPES: Dialog is a real block type (kept above,
    // satisfying the Record<BlockType, ...> annotation) but not a tray item
    // any more, so trayItems.find would never find it.
    for (const type of TRAY_ORDER) {
      const item = trayItems.find((candidate) => candidate.type === type);
      expect(item?.previewSize).toEqual(expected[type]);
    }
  });
});

describe('emptyLayoutJson', () => {
  it('is a single root LayoutBox with the root defaults', () => {
    const tree = JSON.parse(emptyLayoutJson());
    expect(Object.keys(tree)).toEqual(['ROOT']);
    expect(tree.ROOT.type).toEqual({ resolvedName: 'LayoutBox' });
    expect(tree.ROOT.isCanvas).toBe(true);
    expect(tree.ROOT.nodes).toEqual([]);
    expect(tree.ROOT.parent).toBeNull();
    expect(tree.ROOT.props).toEqual(ROOT_LAYOUT_PROPS);
  });
});
