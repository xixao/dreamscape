import { describe, it, expect } from 'vitest';
import { placeWriterPopover, type Bounds } from './placement';
const view = { left: 12, top: 12, right: 1188, bottom: 788 };
const panels = [{ left: 12, top: 12, right: 1188, bottom: 64 }, { left: 12, top: 76, right: 268, bottom: 788 }];
const overlaps = (a: Bounds,b: Bounds) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
describe('Writer popover placement', () => {
 it.each([
  { left: 900, top: 400, right: 1180, bottom: 600 },
  { left: 290, top: 90, right: 950, bottom: 300 },
  { left: 300, top: 600, right: 1100, bottom: 760 },
 ])('avoids selection and chrome near viewport edges', anchor => {
  const result = placeWriterPopover(view, anchor, panels, 300)!;
  expect(result).not.toBeNull();
  const bounds = {...result, right: result.left + result.width, bottom: result.top + result.maxHeight};
  for (const obstacle of [anchor,...panels]) expect(overlaps(bounds,obstacle)).toBe(false);
  expect(bounds.right).toBeLessThanOrEqual(view.right); expect(bounds.bottom).toBeLessThanOrEqual(view.bottom);
 });
 it('never overlaps as a fallback when no space remains', () => {
  expect(placeWriterPopover(view, view, panels, 300)).toBeNull();
 });
});
