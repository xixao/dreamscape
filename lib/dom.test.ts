import { describe, expect, it, vi } from 'vitest';
import { canScrollInDirection, capturePointer, isElementLike, isNodeLike, releasePointer } from './dom';

describe('isNodeLike', () => {
  it('is true for a plain DOM node (element or text)', () => {
    expect(isNodeLike(document.createElement('div'))).toBe(true);
    expect(isNodeLike(document.createTextNode('hi'))).toBe(true);
  });

  it('is false for null and for a plain object that is not a node', () => {
    expect(isNodeLike(null)).toBe(false);
    expect(isNodeLike({} as EventTarget)).toBe(false);
  });

  it('is true for a node from a different document/realm (an iframe), where instanceof Node is false', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const iframeDiv = iframe.contentDocument!.createElement('div');
    iframe.contentDocument!.body.appendChild(iframeDiv);

    expect(iframeDiv instanceof Node).toBe(false);
    expect(isNodeLike(iframeDiv)).toBe(true);

    iframe.remove();
  });
});

describe('isElementLike', () => {
  it('is true for a plain element and false for a node that is not an element', () => {
    expect(isElementLike(document.createElement('div'))).toBe(true);
    expect(isElementLike(document.createTextNode('hi'))).toBe(false);
    expect(isElementLike(null)).toBe(false);
  });

  it('is true for an element from a different document/realm (an iframe), where instanceof HTMLElement is false', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const iframeInput = iframe.contentDocument!.createElement('input');
    iframe.contentDocument!.body.appendChild(iframeInput);

    expect(iframeInput instanceof HTMLElement).toBe(false);
    expect(isElementLike(iframeInput)).toBe(true);

    iframe.remove();
  });
});

describe('capturePointer', () => {
  it('calls setPointerCapture on the element with the given pointer id', () => {
    const el = { setPointerCapture: vi.fn() };
    capturePointer(el, 5);
    expect(el.setPointerCapture).toHaveBeenCalledWith(5);
  });

  it('swallows a NotFoundError (a pointer that is not active)', () => {
    const el = {
      setPointerCapture: vi.fn(() => {
        throw new DOMException('no pointer with this id', 'NotFoundError');
      }),
    };
    expect(() => capturePointer(el, 5)).not.toThrow();
  });

  it('rethrows any other error', () => {
    const el = {
      setPointerCapture: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    expect(() => capturePointer(el, 5)).toThrow('boom');
  });
});

describe('releasePointer', () => {
  it('calls releasePointerCapture on the element with the given pointer id', () => {
    const el = { releasePointerCapture: vi.fn() };
    releasePointer(el, 5);
    expect(el.releasePointerCapture).toHaveBeenCalledWith(5);
  });

  it('swallows a NotFoundError (a pointer that is not active, or already released)', () => {
    const el = {
      releasePointerCapture: vi.fn(() => {
        throw new DOMException('no pointer with this id', 'NotFoundError');
      }),
    };
    expect(() => releasePointer(el, 5)).not.toThrow();
  });

  it('rethrows any other error', () => {
    const el = {
      releasePointerCapture: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    expect(() => releasePointer(el, 5)).toThrow('boom');
  });
});

describe('canScrollInDirection', () => {
  function scrollableDiv(overrides: {
    scrollHeight?: number;
    clientHeight?: number;
    scrollTop?: number;
    scrollWidth?: number;
    clientWidth?: number;
    scrollLeft?: number;
  }): HTMLElement {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollHeight', { value: overrides.scrollHeight ?? 0, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: overrides.clientHeight ?? 0, configurable: true });
    Object.defineProperty(el, 'scrollTop', { value: overrides.scrollTop ?? 0, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { value: overrides.scrollWidth ?? 0, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: overrides.clientWidth ?? 0, configurable: true });
    Object.defineProperty(el, 'scrollLeft', { value: overrides.scrollLeft ?? 0, configurable: true });
    return el;
  }

  it('is false for a null target', () => {
    expect(canScrollInDirection(null, 0, 10)).toBe(false);
  });

  it('is true when the target itself can still scroll down', () => {
    const el = scrollableDiv({ scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    expect(canScrollInDirection(el, 0, 10)).toBe(true);
  });

  it('is false once already at the bottom of the scroll range', () => {
    const el = scrollableDiv({ scrollHeight: 500, clientHeight: 200, scrollTop: 300 });
    expect(canScrollInDirection(el, 0, 10)).toBe(false);
  });

  it('is true when scrolling up and not at the top', () => {
    const el = scrollableDiv({ scrollHeight: 500, clientHeight: 200, scrollTop: 50 });
    expect(canScrollInDirection(el, 0, -10)).toBe(true);
  });

  it('is false when scrolling up and already at the top', () => {
    const el = scrollableDiv({ scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    expect(canScrollInDirection(el, 0, -10)).toBe(false);
  });

  it('checks scrollable ancestors, not just the exact target', () => {
    const scrollable = scrollableDiv({ scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    const child = document.createElement('span');
    scrollable.appendChild(child);
    expect(canScrollInDirection(child, 0, 10)).toBe(true);
  });

  it('is false when nothing in the chain has scroll room in that direction', () => {
    const el = scrollableDiv({ scrollHeight: 200, clientHeight: 200 });
    expect(canScrollInDirection(el, 0, 10)).toBe(false);
  });

  it('checks horizontal scroll room independently from vertical', () => {
    const el = scrollableDiv({ scrollWidth: 800, clientWidth: 300, scrollLeft: 0 });
    expect(canScrollInDirection(el, 10, 0)).toBe(true);
    expect(canScrollInDirection(el, 0, 10)).toBe(false);
  });

  it('works across an iframe realm boundary, where instanceof HTMLElement is false', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument!;
    const el = iframeDoc.createElement('div');
    iframeDoc.body.appendChild(el);
    Object.defineProperty(el, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true });

    expect(el instanceof HTMLElement).toBe(false);
    expect(canScrollInDirection(el, 0, 10)).toBe(true);

    iframe.remove();
  });
});
