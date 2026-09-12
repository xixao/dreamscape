import { describe, expect, it } from 'vitest';
import { parseList } from './lists';

describe('parseList', () => {
  it('splits on commas and trims whitespace', () => {
    expect(parseList('Option 1, Option 2,Option 3')).toEqual(['Option 1', 'Option 2', 'Option 3']);
  });

  it('drops empty items from stray, leading or trailing commas', () => {
    expect(parseList('A,,B,')).toEqual(['A', 'B']);
    expect(parseList(',A')).toEqual(['A']);
    expect(parseList(', ,')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseList('')).toEqual([]);
  });

  it('caps the result at 12 items', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Item ${i + 1}`).join(', ');
    const result = parseList(many);
    expect(result).toHaveLength(12);
    expect(result[0]).toBe('Item 1');
    expect(result[11]).toBe('Item 12');
  });

  it('preserves internal single spaces and only trims the outer edges', () => {
    expect(parseList('  Name With Spaces  , Another One ')).toEqual(['Name With Spaces', 'Another One']);
  });
});
