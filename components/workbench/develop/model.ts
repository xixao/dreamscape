import type { SerializedNodes } from '@craftjs/core';

export function componentType(node: SerializedNodes[string]): string {
  return typeof node.type === 'string' ? node.type : node.type.resolvedName;
}
export function componentName(node: SerializedNodes[string]): string {
  return String(node.custom?.displayName || node.custom?.layerName || node.props.name || node.displayName || componentType(node));
}
export function componentPath(nodes: SerializedNodes, id: string): string[] {
  const path: string[] = []; const seen = new Set<string>();
  while (nodes[id] && !seen.has(id)) {
    seen.add(id); path.unshift(componentName(nodes[id])); id = nodes[id].parent ?? '';
  }
  return path;
}
export function findComponents(nodes: SerializedNodes, text: string): string[] {
  const terms = text.toLowerCase().trim().split(/\s+/);
  return Object.keys(nodes).filter(id => {
    const node = nodes[id];
    const searchable = [componentName(node), componentType(node), id, node.props.text, node.props.label, node.props.placeholder, node.props.children].filter(v => typeof v === 'string').join(' ').toLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}
export const COMMANDS = [
  ['/props', 'Configured props'], ['/props all', 'Include component defaults'], ['/overrides', 'Props that differ from registered defaults'],
  ['/parent', 'Inspect the parent container'], ['/children', 'Find direct children'], ['/layout', 'Show layout bounds and spacing'],
  ['/why width', 'Explain configured and rendered width'], ['/why height', 'Explain configured and rendered height'],
  ['/usage', 'View runnable Dreamscape preview code'], ['/definition', 'View a custom component’s saved definition'],
  ['/instances', 'Find this component type in this screen'], ['/docs', 'Read the local component reference'],
  ['/copy image', 'Copy selected component as PNG'], ['/copy props', 'Copy configured props as JSON'], ['/copy usage', 'Copy Dreamscape preview code'],
  ['/copy context', 'Copy props, path, layout and preview code'], ['/copy link', 'Copy a link to this component'],
] as const;
export function matchingCommands(text: string) {
  const terms = text.toLowerCase().replace(/^\//, '').split(/\s+/).filter(Boolean);
  return COMMANDS.filter(([command, description]) => terms.every(term => `${command} ${description}`.toLowerCase().includes(term))).sort(([a], [b]) => Number(b === text) - Number(a === text) || Number(b.startsWith(text)) - Number(a.startsWith(text)));
}
export function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]');
}
