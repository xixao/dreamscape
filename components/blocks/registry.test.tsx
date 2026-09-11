import { describe, expect, it } from 'vitest';
import { LAYOUT_BOX_DEFAULTS, ROOT_LAYOUT_PROPS } from '@/lib/classes';
import { isResponsive } from '@/lib/responsive';
import { KNOWN_TYPES, ZONE_TYPES, emptyLayoutJson, resolver, schemaFor, trayItems } from './registry';
import type { BlockType } from './schema';

const BLOCK_TYPES: BlockType[] = ['LayoutBox', 'Button', 'Input', 'Card', 'Dialog'];

describe('registry', () => {
  it('resolves every block and both zones', () => {
    expect([...KNOWN_TYPES].sort()).toEqual(
      ['Button', 'Card', 'CardContent', 'Dialog', 'DialogContent', 'Input', 'LayoutBox'],
    );
    expect([...ZONE_TYPES].sort()).toEqual(['CardContent', 'DialogContent']);
  });

  it('has one tray item per block type, in the spec order', () => {
    expect(trayItems.map((item) => item.type)).toEqual(['LayoutBox', 'Card', 'Button', 'Input', 'Dialog']);
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
