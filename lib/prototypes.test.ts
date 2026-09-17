import { describe, expect, it } from 'vitest';
import type { Screen } from './files/repository';
import { collectPrototypes } from './prototypes';
const screen = (id: string, targets: string[] = [], name?: string, pageId = 'one'): Screen => ({ id, name: id, pageId, stageWidth: 1440, layout: JSON.stringify({ ROOT: { custom: { prototypeName: name } }, ...Object.fromEntries(targets.map((targetScreenId, i) => [i, { custom: { interactions: [{ action: 'navigate', targetScreenId }] } }])) }) });
describe('file-wide prototypes', () => {
  it('follows branches across Pages and visits shared screens only once', () => {
    const result = collectPrototypes([screen('start', ['a', 'b']), screen('a', ['end']), screen('b', ['end'], undefined, 'two'), screen('end')]);
    expect(result).toHaveLength(1);
    expect(result[0].screens.map(s => s.id)).toEqual(['start', 'a', 'b', 'end']);
  });
  it('includes cyclic flows without looping', () => {
    expect(collectPrototypes([screen('a', ['b']), screen('b', ['a'])])[0].screens.map(s => s.id)).toEqual(['a', 'b']);
  });
  it('keeps explicitly named starting screens even when another flow reaches them', () => {
    const result = collectPrototypes([screen('a', ['b'], 'Apply'), screen('b', [], 'Review'), screen('unused')]);
    expect(result.map(f => f.name)).toEqual(['Apply', 'Review']);
    expect(result[1].screens).toHaveLength(1);
  });
  it('ignores deleted targets and malformed layouts without hiding valid flows', () => {
    expect(collectPrototypes([{ ...screen('broken'), layout: '{' }, screen('a', ['gone']), screen('b', [], 'Named')]).map(f => f.name)).toEqual(['Named']);
  });
  it('includes overlays in their flow without promoting them to starting screens', () => {
    const start = screen('a'); start.layout = JSON.stringify({ ROOT: { custom: { interactions: [{ action: 'openOverlay', targetScreenId: 'overlay' }] } } });
    const result = collectPrototypes([start, { ...screen('overlay'), kind: 'overlay' }]);
    expect(result).toHaveLength(1); expect(result[0].screens.map(s => s.id)).toEqual(['a', 'overlay']);
  });
});
