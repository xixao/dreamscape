import { describe, expect, it } from 'vitest';
import { DIAGRAM_TOOL_ITEMS, diagramToolDocKey } from '@/components/workbench/diagram/diagram-palette';
import { ELEMENT_DOCS, getElementDoc, type ElementDoc } from './docs';
import { trayItems } from './registry';

const FALLBACK = getElementDoc('NoSuchElement');

// The two lists the Components tab renders (spec docs/superpowers/specs/2026-
// 09-13-diagrams-design.md section 13): Craft tray items (registry.tsx) and
// the diagram palette's seven tools (diagram-palette.tsx), each reduced to
// the {key, label} pair the completeness checks below need - `key` is
// whatever ELEMENT_DOCS is actually keyed by for that row (a BlockType for a
// tray item, diagramToolDocKey's id for a diagram tool).
const TRAY_DOC_ITEMS = trayItems.map((item) => ({ key: item.type as string, label: item.label }));
const DIAGRAM_DOC_ITEMS = DIAGRAM_TOOL_ITEMS.map((item) => ({ key: diagramToolDocKey(item.tool), label: item.label }));

describe('ELEMENT_DOCS', () => {
  it('has an entry, with a non-empty summary and usage, for every tray item and every diagram tool', () => {
    for (const { key, label } of [...TRAY_DOC_ITEMS, ...DIAGRAM_DOC_ITEMS]) {
      const doc: ElementDoc | undefined = ELEMENT_DOCS[key];
      expect(doc, `missing docs for "${label}" (key "${key}")`).toBeDefined();
      expect(doc!.summary.trim().length, `${key} summary`).toBeGreaterThan(0);
      expect(doc!.usage.trim().length, `${key} usage`).toBeGreaterThan(0);
      expect(doc!.summary).not.toEqual(doc!.usage);
    }
  });

  it('has no entry for a key that is not a tray item or a diagram tool (a stale key)', () => {
    const validKeys = new Set<string>([...TRAY_DOC_ITEMS, ...DIAGRAM_DOC_ITEMS].map((item) => item.key));
    for (const key of Object.keys(ELEMENT_DOCS)) {
      expect(validKeys.has(key), `docs key "${key}" is not a tray item type or a diagram tool id`).toBe(true);
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
