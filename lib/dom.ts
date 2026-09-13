// Cross-realm DOM duck-typing helpers.
//
// The responsive canvas renders its artboard inside an `<iframe>` with its
// own document (components/workbench/canvas-frame.tsx): a DOM node that
// document creates has that realm's own `Node`/`HTMLElement` constructors,
// so `target instanceof Node` (or `instanceof HTMLElement`) checked against
// the PARENT window's constructors silently returns `false` for it even
// though it plainly is one. Every DOM node, from any realm, carries these
// same own/inherited members, so duck-typing on their presence works
// regardless of which document/window created the node.

export function isNodeLike(target: EventTarget | null): target is Node {
  return !!target && typeof target === 'object' && 'nodeType' in target && 'contains' in target;
}

export function isElementLike(target: EventTarget | null): target is HTMLElement {
  return isNodeLike(target) && 'tagName' in target && 'closest' in target;
}
