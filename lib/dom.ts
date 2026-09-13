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

interface PointerCaptureTarget {
  setPointerCapture(pointerId: number): void;
}

interface PointerReleaseTarget {
  releasePointerCapture(pointerId: number): void;
}

// Duck-typed rather than `error instanceof DOMException`: every call site
// this backs (canvas.tsx, frame-title.tsx, stage.tsx's resize handles) only
// ever captures/releases on a plain-document element, so a realm mismatch
// is not the concern here the way it is for isNodeLike/isElementLike above -
// this is simply the same "check what the error actually looks like, not
// what constructor produced it" caution applied consistently.
function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'NotFoundError';
}

/**
 * `element.setPointerCapture(pointerId)`, swallowing the `NotFoundError` a
 * real browser throws when `pointerId` does not identify an active pointer -
 * a synthetic test event with a made-up id, or a real pointer already
 * released/cancelled by the time this runs. Every other error still throws.
 *
 * Also a no-op when `setPointerCapture` is not even a function on `element` -
 * every real browser has it on every element in every document/realm, but
 * this repo's jsdom test setup (vitest.setup.ts) only polyfills it onto the
 * PARENT document's own `Element.prototype`; an element from a frame's own
 * `contentDocument` (components/workbench/canvas-frame.tsx) is a fresh realm
 * that patch never reaches, so it genuinely lacks the method there. A real
 * browser never takes this branch.
 */
export function capturePointer(element: PointerCaptureTarget, pointerId: number): void {
  if (typeof element.setPointerCapture !== 'function') return;
  try {
    element.setPointerCapture(pointerId);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

/** The `releasePointerCapture` counterpart to `capturePointer` above. */
export function releasePointer(element: PointerReleaseTarget, pointerId: number): void {
  if (typeof element.releasePointerCapture !== 'function') return;
  try {
    element.releasePointerCapture(pointerId);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

function elementHasScrollRoom(element: HTMLElement, deltaX: number, deltaY: number): boolean {
  if (deltaY !== 0 && element.scrollHeight > element.clientHeight) {
    if (deltaY > 0 && element.scrollTop + element.clientHeight < element.scrollHeight) return true;
    if (deltaY < 0 && element.scrollTop > 0) return true;
  }
  if (deltaX !== 0 && element.scrollWidth > element.clientWidth) {
    if (deltaX > 0 && element.scrollLeft + element.clientWidth < element.scrollWidth) return true;
    if (deltaX < 0 && element.scrollLeft > 0) return true;
  }
  return false;
}

/**
 * Whether `target` - or a scrollable ancestor of it, all the way up through
 * its own document's `<html>` - still has room to scroll further in the
 * direction implied by `(deltaX, deltaY)`: positive scrolls toward the end
 * of that axis (down/right), negative toward the start (up/left). Used by
 * components/workbench/canvas.tsx's wheel handler to decide whether a
 * wheel/trackpad gesture over the focused frame should scroll that frame's
 * own content instead of panning the canvas - "the frame's own scrolling
 * element" for a fixed-height frame is reached the same way, since it is
 * just as much an ancestor of the wheel target as any inner scrolling div.
 *
 * `isElementLike`, not `instanceof Element`: the wheel can originate inside
 * an iframe's own document (canvas-frame.tsx), whose elements have that
 * realm's own constructors. Deliberately does not consult computed overflow
 * CSS, only actual scroll capacity (scrollHeight/Width vs. clientHeight/
 * Width) plus headroom in the requested direction - an element with
 * `overflow: visible` and overflowing content is not really a scroll
 * container, but a real browser would just bubble the wheel event up to
 * whichever ancestor actually is one anyway, which continuing this same
 * walk up the tree already reaches.
 */
export function canScrollInDirection(target: EventTarget | null, deltaX: number, deltaY: number): boolean {
  let element = isElementLike(target) ? target : null;
  while (element) {
    if (elementHasScrollRoom(element, deltaX, deltaY)) return true;
    element = element.parentElement;
  }
  return false;
}
