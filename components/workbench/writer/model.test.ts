import { describe, it, expect } from 'vitest';
import type { Tree } from '@/lib/custom-components/model';
import { writerTargets, updateWriterField, missingAccessibility } from './model';
const node = (type: string, props: Record<string, unknown> = {}, parent: string | null = 'ROOT') => ({ type: { resolvedName: type }, props, parent, nodes: [] as string[], linkedNodes: {}, custom: {}, displayName: type, hidden: false, isCanvas: type === 'LayoutBox' });
const tree: Tree = { ROOT: { ...node('LayoutBox', { paddingPx: 24 }, null), nodes: ['text', 'image', 'input'] }, text: node('Text', { text: 'Original', role: 'heading1', grow: true }), image: node('Image', { alt: '', size: { width: 300, height: 200, locked: true } }), input: node('Input', { label: '' }) };
describe('Writer content boundary', () => {
 it('changes copy without touching style, structure, or custom metadata', () => {
   const layout = JSON.stringify(tree); const target = writerTargets(layout).find(t => t.nodeId === 'text')!;
   const next = JSON.parse(updateWriterField(layout, target.key, 'text', 'A much longer heading'));
   expect(next).toEqual({ ...tree, text: { ...tree.text, props: { ...tree.text.props, text: 'A much longer heading' } } });
   for (const prop of ['grow', 'role', 'paddingPx', '__proto__']) expect(updateWriterField(layout, target.key, prop, 'bad')).toBe(layout);
 });
 it('distinguishes decorative images and labels from missing text', () => {
   expect(missingAccessibility('Image', { alt: '', decorative: true })).toBe(false);
   expect(missingAccessibility('Image', { alt: '   ' })).toBe(true);
   expect(missingAccessibility('Input', { placeholder: 'Search' })).toBe(true);
   expect(missingAccessibility('Input', { accessibleLabel: 'Search applications' })).toBe(false);
   expect(missingAccessibility('Button', { iconOnly: true, accessibleLabel: 'Attach', label: '' })).toBe(false);
 });
 it('preserves alt text when toggling decorative and prevents editing hidden alt', () => {
   const layout = JSON.stringify({ ...tree, image: node('Image', { alt: 'Landscape' }) });
   const target = writerTargets(layout).find(t => t.nodeId === 'image')!;
   const decorative = updateWriterField(layout, target.key, 'decorative', true);
   expect(JSON.parse(decorative).image.props.alt).toBe('Landscape');
   expect(updateWriterField(decorative, target.key, 'alt', 'Overwrite')).toBe(decorative);
   expect(writerTargets(updateWriterField(decorative, target.key, 'decorative', false)).find(t => t.key === target.key)?.props.alt).toBe('Landscape');
 });
 it('writes custom content into only that instance override', () => {
   const definition = JSON.stringify(tree);
   const layout = JSON.stringify({ ROOT: { ...tree.ROOT, nodes: ['instance', 'other'] }, instance: node('CustomComponent', { layout: definition }), other: node('CustomComponent', { layout: definition }) });
   const target = writerTargets(layout).find(t => t.nodeId === 'instance' && t.innerId === 'text')!;
   const next = JSON.parse(updateWriterField(layout, target.key, 'text', 'Local copy'));
   expect(next.instance.props.layout).toBe(definition);
   expect(next.instance.props.overrides.text.text).toBe('Local copy');
   expect(next.other.props.overrides).toBeUndefined();
 });
});

it('excludes sample table data while allowing headers, chips and state messages', () => {
 const layout = JSON.stringify({ROOT:{...node('LayoutBox',{},null),nodes:['table']},table:node('Table',{recordData:'Sample row',searchable:true})});
 const target=writerTargets(layout)[0];
 expect(target.fields.map(f=>f.prop)).not.toContain('recordData');
 for(const prop of ['columns','filterLabels','searchPlaceholder','emptyTitle','errorTitle']) expect(target.fields.map(f=>f.prop)).toContain(prop);
 expect(updateWriterField(layout,target.key,'recordData','Changed')).toBe(layout);
});
