import { describe, expect, it } from 'vitest';
import { designStyle } from './design-controls';

describe('border rendering', () => {
  it('preserves legacy borders', () => {
    expect(designStyle({ borderWidth: 4, borderColor: 'var(--primary)' })).toMatchObject({ borderWidth: 4, borderColor: 'var(--primary)', borderStyle: 'solid' });
  });
  it('renders individual sides, style and opacity', () => {
    expect(designStyle({ border: { width: 4, color: 'var(--primary)', opacity: 50, sides: 'bottom', style: 'dashed' } })).toMatchObject({ borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 4, borderLeftWidth: 0, borderStyle: 'dashed', borderColor: 'color-mix(in srgb, var(--primary) 50%, transparent)' });
  });
  it('hides without changing layout and removes a legacy border explicitly', () => {
    expect(designStyle({ border: { width: 4, visible: false } })).toMatchObject({ borderWidth: 4, borderTopWidth: 4, borderColor: 'transparent' });
    expect(designStyle({ borderWidth: 4, border: { width: 0 } })).toMatchObject({ borderWidth: 0, borderTopWidth: 0 });
  });
  it('supports custom sides with zero and fallback widths', () => {
    expect(designStyle({ border: { width: 4, sides: 'custom', top: 0, left: 8 } })).toMatchObject({ borderTopWidth: 0, borderRightWidth: 4, borderBottomWidth: 4, borderLeftWidth: 8 });
  });
});
