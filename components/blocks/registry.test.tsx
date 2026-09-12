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

const TRAY_ORDER: BlockType[] = BLOCK_TYPES;

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
    expect(byGroup('Feedback')).toEqual(['Alert', 'Progress', 'Dialog']);
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
