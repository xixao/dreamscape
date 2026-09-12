import { describe, expect, it } from 'vitest';
import { HOLD_MS, MOVE_TOLERANCE_PX, stackUnder, type LayerStackNode } from './layer-stack';

function el(): HTMLElement {
  return document.createElement('div');
}

describe('layer stack timing constants', () => {
  it('holds for 350 ms and tolerates 4 px of drift', () => {
    expect(HOLD_MS).toBe(350);
    expect(MOVE_TOLERANCE_PX).toBe(4);
  });
});

describe('stackUnder', () => {
  it('orders the stack deepest first, with the root last as Frame', () => {
    const rootDom = el();
    const cardDom = el();
    const buttonDom = el();
    rootDom.appendChild(cardDom);
    cardDom.appendChild(buttonDom);

    const nodes: Record<string, LayerStackNode> = {
      ROOT: { id: 'ROOT', dom: rootDom, parent: null, name: 'LayoutBox', displayName: 'Frame' },
      card: { id: 'card', dom: cardDom, parent: 'ROOT', name: 'Card', displayName: 'Card' },
      button: { id: 'button', dom: buttonDom, parent: 'card', name: 'Button', displayName: 'Button' },
    };

    expect(stackUnder(nodes, buttonDom)).toEqual([
      { id: 'button', name: 'Button', displayName: 'Button' },
      { id: 'card', name: 'Card', displayName: 'Card' },
      { id: 'ROOT', name: 'LayoutBox', displayName: 'Frame' },
    ]);
  });

  it('skips zone nodes such as CardContent', () => {
    const rootDom = el();
    const cardDom = el();
    const zoneDom = el();
    const buttonDom = el();
    rootDom.appendChild(cardDom);
    cardDom.appendChild(zoneDom);
    zoneDom.appendChild(buttonDom);

    const nodes: Record<string, LayerStackNode> = {
      ROOT: { id: 'ROOT', dom: rootDom, parent: null, name: 'LayoutBox', displayName: 'Frame' },
      card: { id: 'card', dom: cardDom, parent: 'ROOT', name: 'Card', displayName: 'Card' },
      content: {
        id: 'content',
        dom: zoneDom,
        parent: 'card',
        name: 'CardContent',
        displayName: 'CardContent',
      },
      button: { id: 'button', dom: buttonDom, parent: 'content', name: 'Button', displayName: 'Button' },
    };

    expect(stackUnder(nodes, buttonDom).map((entry) => entry.id)).toEqual(['button', 'card', 'ROOT']);
  });

  it('excludes nodes unrelated to the press target', () => {
    const rootDom = el();
    const cardDom = el();
    const buttonDom = el();
    const siblingDom = el();
    rootDom.appendChild(cardDom);
    cardDom.appendChild(buttonDom);
    rootDom.appendChild(siblingDom);

    const nodes: Record<string, LayerStackNode> = {
      ROOT: { id: 'ROOT', dom: rootDom, parent: null, name: 'LayoutBox', displayName: 'Frame' },
      card: { id: 'card', dom: cardDom, parent: 'ROOT', name: 'Card', displayName: 'Card' },
      button: { id: 'button', dom: buttonDom, parent: 'card', name: 'Button', displayName: 'Button' },
      sibling: { id: 'sibling', dom: siblingDom, parent: 'ROOT', name: 'Button', displayName: 'Button' },
    };

    const result = stackUnder(nodes, buttonDom).map((entry) => entry.id);
    expect(result).toEqual(['button', 'card', 'ROOT']);
    expect(result).not.toContain('sibling');
  });

  it('returns nothing when no node contains the target', () => {
    const nodes: Record<string, LayerStackNode> = {
      ROOT: { id: 'ROOT', dom: el(), parent: null, name: 'LayoutBox', displayName: 'Frame' },
    };
    expect(stackUnder(nodes, el())).toEqual([]);
  });

  it('returns nothing for a null target', () => {
    const nodes: Record<string, LayerStackNode> = {
      ROOT: { id: 'ROOT', dom: el(), parent: null, name: 'LayoutBox', displayName: 'Frame' },
    };
    expect(stackUnder(nodes, null)).toEqual([]);
  });
});
