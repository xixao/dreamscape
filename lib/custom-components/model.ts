import { nanoid } from 'nanoid';
import { z } from 'zod';
import { emptyLayoutJson, KNOWN_TYPES } from '@/components/blocks/known-types';

export const componentDefinitionSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().trim().min(1).max(120),
  layout: z.string().max(500000).refine(isComponentLayout, 'Invalid component layout'),
});
export const componentLibrarySchema = z.array(componentDefinitionSchema).max(100).refine(
  entries => new Set(entries.map(entry => entry.id)).size === entries.length, 'Duplicate component id',
);
export type ComponentDefinition = z.infer<typeof componentDefinitionSchema>;
export type TreeNode = {
  type: { resolvedName: string }; props: Record<string, unknown>; nodes: string[];
  linkedNodes: Record<string, string>; parent: string | null; isCanvas: boolean;
  custom: Record<string, unknown>; displayName: string; hidden: boolean;
};
export type Tree = Record<string, TreeNode>;
export type ContentOverrides = Record<string, Record<string, unknown>>;
export function isComponentLayout(layout: string): boolean {
  try {
    const tree = JSON.parse(layout) as Tree;
    if (!tree.ROOT || tree.ROOT.type?.resolvedName !== 'LayoutBox') return false;
    const visited = new Set<string>();
    function visit(id: string, parent: string | null): boolean {
      const n = tree[id];
      if (!n || visited.has(id) || !KNOWN_TYPES.has(n.type?.resolvedName) || n.type.resolvedName === 'CustomComponent' || n.parent !== parent || !Array.isArray(n.nodes) || !n.linkedNodes || !n.props) return false;
      visited.add(id);
      return [...n.nodes, ...Object.values(n.linkedNodes)].every(child => visit(child, id));
    }
    return visit('ROOT', null) && visited.size === Object.keys(tree).length;
  } catch { return false; }
}
export function newComponent(): ComponentDefinition {
  return { id: nanoid(10), name: 'Untitled component', layout: emptyLayoutJson() };
}
export function applyContent(layout: string, overrides: ContentOverrides = {}): string {
  const tree = JSON.parse(layout) as Tree;
  for (const [id, props] of Object.entries(overrides)) if (tree[id]) Object.assign(tree[id].props, props);
  return JSON.stringify(tree);
}
/** Materialize an instance into ordinary nodes, retaining its root id and sibling position. */
export function detachInstance(tree: Tree, id: string): void {
  const instance = tree[id];
  const source = JSON.parse(applyContent(instance.props.layout as string, instance.props.overrides as ContentOverrides)) as Tree;
  const ids = Object.fromEntries(Object.keys(source).map(key => [key, key === 'ROOT' ? id : nanoid(10)]));
  for (const [key, node] of Object.entries(source)) {
    tree[ids[key]] = { ...node, parent: key === 'ROOT' ? instance.parent : ids[node.parent!],
      nodes: node.nodes.map(child => ids[child]),
      linkedNodes: Object.fromEntries(Object.entries(node.linkedNodes).map(([slot, child]) => [slot, ids[child]])),
    };
  }
}
export function updateInstances(layout: string, definition: ComponentDefinition, detach = false): string {
  const tree = JSON.parse(layout) as Tree;
  for (const [id, node] of Object.entries(tree)) {
    if (node.type.resolvedName !== 'CustomComponent' || node.props.componentId !== definition.id) continue;
    if (detach) detachInstance(tree, id);
    else Object.assign(node.props, { layout: definition.layout, name: definition.name });
  }
  return JSON.stringify(tree);
}
export function countInstances(layouts: string[], componentId: string): number {
  return layouts.reduce((total, layout) => total + Object.values(JSON.parse(layout) as Tree).filter(
    node => node.type.resolvedName === 'CustomComponent' && node.props.componentId === componentId,
  ).length, 0);
}
export function componentFromSelection(layout: string, id: string): ComponentDefinition {
  const tree = JSON.parse(layout) as Tree;
  const source = tree[id];
  const result: Tree = {};
  function copy(key: string) {
    const node = tree[key];
    result[key] = structuredClone(node);
    [...node.nodes, ...Object.values(node.linkedNodes)].forEach(copy);
  }
  copy(id);
  if (source.type.resolvedName === 'LayoutBox') {
    result.ROOT = { ...result[id], parent: null };
    if (id !== 'ROOT') delete result[id];
    [...result.ROOT.nodes, ...Object.values(result.ROOT.linkedNodes)].forEach(child => { result[child].parent = 'ROOT'; });
  } else {
    result.ROOT = JSON.parse(emptyLayoutJson()).ROOT;
    result.ROOT.nodes = [id]; result[id].parent = 'ROOT';
  }
  return { id: nanoid(10), name: source.displayName || 'Untitled component', layout: JSON.stringify(result) };
}

export function replaceSelection(layout: string, id: string, definition: ComponentDefinition): string {
  const tree = JSON.parse(layout) as Tree;
  if (!tree[id]) return layout;
  const original = tree[id];
  function remove(key: string) {
    const node = tree[key];
    [...node.nodes, ...Object.values(node.linkedNodes)].forEach(remove);
    delete tree[key];
  }
  remove(id);
  const instanceId = id === 'ROOT' ? nanoid(10) : id;
  tree[instanceId] = { type: { resolvedName: 'CustomComponent' }, props: { componentId: definition.id, name: definition.name, layout: definition.layout, overrides: {} },
    parent: id === 'ROOT' ? 'ROOT' : original.parent, nodes: [], linkedNodes: {}, isCanvas: false, custom: {}, hidden: false, displayName: definition.name };
  if (id === 'ROOT') {
    tree.ROOT = JSON.parse(emptyLayoutJson()).ROOT;
    tree.ROOT.nodes = [instanceId];
    tree.ROOT.props.paddingPx = 0;
  }
  return JSON.stringify(tree);
}
