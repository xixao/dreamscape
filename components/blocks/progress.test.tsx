import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Progress, clampPercent } from './progress';
import { renderTree } from '@/test/craft-harness';

describe('clampPercent', () => {
  it('parses a numeric string', () => {
    expect(clampPercent('42')).toBe(42);
  });

  it('clamps below 0 and above 100', () => {
    expect(clampPercent('-10')).toBe(0);
    expect(clampPercent('150')).toBe(100);
  });

  it('falls back to 0 for non-numeric text', () => {
    expect(clampPercent('not a number')).toBe(0);
    expect(clampPercent('')).toBe(0);
  });
});

// The installed shadcn Progress component destructures `value` out of its
// own props to compute the indicator's inline transform, but never forwards
// it back to the Radix Root: the Root's own `data-value`/`aria-valuenow`
// stay unset no matter what value is passed in. The indicator's transform
// is therefore the only observable effect of the block's `value` prop.
describe('Progress block', () => {
  it('renders at the default 50% with no label', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Progress />
      </Element>,
    );
    const indicator = await waitFor(() => {
      const el = container.querySelector('[data-slot="progress-indicator"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(indicator).toHaveStyle('transform: translateX(-50%)');
    expect(container.querySelector('label')).toBeNull();
  });

  it('shows a label above the bar when given', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Progress label="Upload progress" value="75" />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-slot="progress-indicator"]')).not.toBeNull());
    expect(container.querySelector('label')).toHaveTextContent('Upload progress');
    expect(container.querySelector('[data-slot="progress-indicator"]')).toHaveStyle(
      'transform: translateX(-25%)',
    );
  });

  it('clamps an out-of-range value prop before it reaches the bar', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Progress value="-20" />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-slot="progress-indicator"]')).not.toBeNull());
    // Clamped to 0, so the indicator sits fully offset: translateX(-100%).
    expect(container.querySelector('[data-slot="progress-indicator"]')).toHaveStyle(
      'transform: translateX(-100%)',
    );
  });

  it('applies grow to the wrapper', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Progress grow />
      </Element>,
    );
    const block = await waitFor(() => {
      const el = container.querySelector('[data-block="Progress"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(block).toHaveClass('flex-1');
  });
});
