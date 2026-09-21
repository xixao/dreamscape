import { describe, expect, it } from 'vitest';
import { layerLabel } from './layer-label';
describe('layer labels', () => {
  it('uses current text instead of a stale generated name', () => {
    expect(layerLabel({ name: 'Text', props: { text: 'Updated copy' }, custom: { layerName: 'Original copy' } })).toBe('Updated copy');
  });
  it('uses current button copy', () => {
    expect(layerLabel({ name: 'Button', props: { label: 'Continue' }, custom: { layerName: 'Button' } })).toBe('Continue');
  });
  it('keeps an explicitly named layer stable after editing its copy', () => {
    expect(layerLabel({ name: 'Button', props: { label: 'Continue' }, custom: { layerName: 'Primary action', layerNameExplicit: true } })).toBe('Primary action');
  });
  it('preserves structural names and falls back for blank text', () => {
    expect(layerLabel({ name: 'Card', custom: { layerName: 'Summary' } })).toBe('Summary');
    expect(layerLabel({ name: 'Text', displayName: 'Text', props: { text: '' } })).toBe('Text');
  });
});
