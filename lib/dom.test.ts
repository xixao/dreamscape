import { describe, expect, it } from 'vitest';
import { isElementLike, isNodeLike } from './dom';

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
