import { describe, expect, it } from 'vitest';
import { componentLibrarySchema, newComponent, isComponentLayout, updateInstances, detachInstance, type Tree } from './model';
import { resolve, breakpointForWidth } from '../responsive';

describe('custom component definitions and instances', () => {
  it('accepts a connected assembly and rejects cycles, unknown types, and recursive custom components', () => {
    const definition = newComponent();
    expect(isComponentLayout(definition.layout)).toBe(true);
    const tree = JSON.parse(definition.layout) as Tree;
    tree.ROOT.nodes = ['ROOT'];
    expect(isComponentLayout(JSON.stringify(tree))).toBe(false);
    tree.ROOT.nodes = []; tree.ROOT.type.resolvedName = 'CustomComponent';
    expect(isComponentLayout(JSON.stringify(tree))).toBe(false);
    expect(componentLibrarySchema.safeParse([definition, definition]).success).toBe(false);
  });
  it('updates shared layout without replacing instance content and detaches into valid ordinary nodes', () => {
    const definition = newComponent();
    const component = JSON.parse(definition.layout) as Tree;
    component.ROOT.nodes = ['text'];
    component.text = { ...component.ROOT, type: { resolvedName: 'Text' }, props: { text: 'Default' }, nodes: [], parent: 'ROOT', isCanvas: false };
    definition.layout = JSON.stringify(component);
    const page = JSON.parse(newComponent().layout) as Tree;
    page.ROOT.nodes = ['instance'];
    page.instance = { ...page.ROOT, type: { resolvedName: 'CustomComponent' }, parent: 'ROOT', nodes: [], isCanvas: false,
      props: { componentId: definition.id, layout: definition.layout, overrides: { text: { text: 'Personalized' } } } };
    component.ROOT.props.paddingPx = 32;
    definition.layout = JSON.stringify(component);
    const updated = JSON.parse(updateInstances(JSON.stringify(page), definition)) as Tree;
    expect(updated.instance.props.overrides).toEqual({ text: { text: 'Personalized' } });
    detachInstance(updated, 'instance');
    expect(updated.ROOT.nodes).toEqual(['instance']);
    expect(updated.instance.props.paddingPx).toBe(32);
    expect(updated[updated.instance.nodes[0]].props.text).toBe('Personalized');
    expect(isComponentLayout(JSON.stringify(updated))).toBe(true);
  });
  it('introduces tablet without changing legacy responsive appearance', () => {
    expect(breakpointForWidth(800)).toBe('tablet');
    expect(resolve({ mobile: 'column', desktop: 'row' }, 'tablet')).toBe('row');
    expect(resolve({ mobile: 'column', tablet: 'column', desktop: 'row' }, 'tablet')).toBe('column');
  });
});
