import { createElement, cloneElement, type ComponentType, type ReactElement } from 'react';
import type { TrayItem } from '@/components/blocks/registry';

// Craft compares component identity. Resolve at drag time because Fast Refresh
// can replace a tray factory before the mounted editor's resolver updates.
export function createTrayElement(item: TrayItem, resolver: Record<string, string | ComponentType<any>>): ReactElement {
  const element = item.create() as ReactElement<Record<string, unknown>>;
  const component = resolver[item.type];
  if (!component) throw new Error(`No registered component for ${item.type}`);
  return 'is' in element.props ? cloneElement(element, { is: component }) : createElement(component, element.props);
}
