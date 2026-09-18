import { resolver, schemaFor } from '@/components/blocks/registry';
import type { FieldSchema } from '@/components/blocks/schema';
import type { Tree, ContentOverrides } from '@/lib/custom-components/model';

export interface WriterTarget {
  key: string; nodeId: string; innerId?: string; name: string; type: string;
  props: Record<string, unknown>; fields: FieldSchema[]; missing: boolean;
}
export function contentFields(type: string, props: Record<string, unknown>): FieldSchema[] {
  const seen = new Set<string>();
  return (schemaFor(type)?.fields ?? []).filter(field => {
    const allowed = ((field.section === 'Content' || field.section === 'Accessibility' || field.prop === 'accessibleLabel') && field.kind === 'text' && !['value', 'filterColumn', 'recordData'].includes(field.prop)) || field.prop === 'decorative';
    if (!allowed || seen.has(field.prop) || (field.showWhen && !field.showWhen(props))) return false;
    seen.add(field.prop); return true;
  });
}
export function resolvedProps(type: string, props: Record<string, unknown>) {
  const component = resolver[type as keyof typeof resolver];
  return { ...component?.craft?.props, ...props } as Record<string, unknown>;
}
export function missingAccessibility(type: string, props: Record<string, unknown>): boolean {
  const blank = (key: string) => !String(props[key] ?? '').trim();
  if (type === 'Image') return !props.decorative && blank('alt');
  if (type === 'Button') return !!props.iconOnly && blank('accessibleLabel') && blank('label');
  if (['Input', 'Textarea', 'Select', 'Checkbox', 'Switch', 'Slider', 'RadioGroup', 'Progress'].includes(type)) return blank('label') && blank('accessibleLabel');
  return false;
}
export function writerTargets(layout: string): WriterTarget[] {
  const tree = JSON.parse(layout) as Tree;
  const targets: WriterTarget[] = [];
  const collect = (nodes: Tree, outer?: string, overrides: ContentOverrides = {}) => {
    const seen = new Set<string>();
    const visit = (id: string) => {
      const node = nodes[id]; if (!node || seen.has(id)) return; seen.add(id);
      const type = node.type.resolvedName;
      if (type === 'CustomComponent' && !outer && typeof node.props.layout === 'string') {
        collect(JSON.parse(node.props.layout), id, node.props.overrides as ContentOverrides ?? {});
      } else {
        const props = resolvedProps(type, { ...node.props, ...overrides[id] });
        const fields = contentFields(type, props);
        if (fields.length) targets.push({ key: JSON.stringify([outer ?? id, outer ? id : null]), nodeId: outer ?? id, innerId: outer ? id : undefined,
          name: String(node.custom?.displayName || node.custom?.layerName || node.displayName || type), type, props, fields, missing: missingAccessibility(type, props) });
      }
      [...node.nodes, ...Object.values(node.linkedNodes)].forEach(visit);
    };
    visit('ROOT');
  };
  collect(tree); return targets;
}
/** The only Writer mutation: deny unknown, hidden, and non-content props. */
export function updateWriterField(layout: string, key: string, prop: string, value: unknown): string {
  const target = writerTargets(layout).find(item => item.key === key);
  const field = target?.fields.find(item => item.prop === prop);
  if (!target || !field || (field.kind === 'boolean' ? typeof value !== 'boolean' : typeof value !== 'string')) return layout;
  if ((target.props[prop] ?? (field.kind === 'boolean' ? false : '')) === value) return layout;
  const tree = JSON.parse(layout) as Tree;
  if (target.innerId) {
    const owner = tree[target.nodeId].props;
    const overrides = owner.overrides as ContentOverrides ?? {};
    owner.overrides = { ...overrides, [target.innerId]: { ...overrides[target.innerId], [prop]: value } };
  } else tree[target.nodeId].props[prop] = value;
  return JSON.stringify(tree);
}
