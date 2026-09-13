import { describe, expect, it } from 'vitest';
import { ELEMENT_DOCS, getElementDoc, type ElementDoc } from './docs';
import { trayItems } from './registry';

const FALLBACK = getElementDoc('NoSuchElement');

describe('ELEMENT_DOCS', () => {
  it('has an entry, with a non-empty summary and usage, for every tray item', () => {
    for (const item of trayItems) {
      const doc: ElementDoc | undefined = ELEMENT_DOCS[item.type];
      expect(doc, `missing docs for tray item "${item.type}"`).toBeDefined();
      expect(doc!.summary.trim().length, `${item.type} summary`).toBeGreaterThan(0);
      expect(doc!.usage.trim().length, `${item.type} usage`).toBeGreaterThan(0);
      expect(doc!.summary).not.toEqual(doc!.usage);
    }
  });

  it('has no entry for a type that is not in the tray (a stale key)', () => {
    const trayTypes = new Set<string>(trayItems.map((item) => item.type));
    for (const key of Object.keys(ELEMENT_DOCS)) {
      expect(trayTypes.has(key), `docs key "${key}" is not a tray item type`).toBe(true);
    }
  });

  it('is written in plain product language: complete sentences, no em dashes', () => {
    for (const [type, doc] of Object.entries(ELEMENT_DOCS)) {
      for (const text of [doc.summary, doc.usage]) {
        expect(text, `${type}: no em dashes`).not.toMatch(/—/);
        expect(text, `${type}: ends with a full stop`).toMatch(/\.$/);
      }
    }
  });

  it('keeps Figma vocabulary: never "block" or "component" for an element', () => {
    for (const [type, doc] of Object.entries(ELEMENT_DOCS)) {
      for (const text of [doc.summary, doc.usage]) {
        expect(text, `${type}: ${text}`).not.toMatch(/\b(block|blocks|component|components)\b/i);
      }
    }
  });
});

describe('getElementDoc', () => {
  it('returns the entry for a documented type', () => {
    expect(getElementDoc('Button')).toBe(ELEMENT_DOCS.Button);
    expect(getElementDoc('LayoutBox')).toBe(ELEMENT_DOCS.LayoutBox);
  });

  it('returns a generic fallback for an unknown type', () => {
    expect(FALLBACK.summary.trim().length).toBeGreaterThan(0);
    expect(FALLBACK.usage.trim().length).toBeGreaterThan(0);
    expect(Object.values(ELEMENT_DOCS)).not.toContain(FALLBACK);
    expect(getElementDoc('')).toBe(FALLBACK);
  });

  it('never returns an Object.prototype member for a type that happens to be one', () => {
    // A plain object lookup would hand back Object.prototype.constructor for
    // "constructor"; the fallback is the only right answer for a non-element.
    expect(getElementDoc('constructor')).toBe(FALLBACK);
    expect(getElementDoc('toString')).toBe(FALLBACK);
  });
});
