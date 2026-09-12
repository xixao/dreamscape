import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Separator } from './separator';
import { renderTree } from '@/test/craft-harness';

describe('Separator block', () => {
  it('renders horizontal by default with a full width', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Separator />
      </Element>,
    );
    const block = await waitFor(() => {
      const el = container.querySelector('[data-block="Separator"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(block).toHaveAttribute('data-orientation', 'horizontal');
    expect(block).toHaveClass('w-full');
  });

  it('renders vertical without forcing a width class', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Separator orientation="vertical" />
      </Element>,
    );
    const block = await waitFor(() => {
      const el = container.querySelector('[data-block="Separator"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(block).toHaveAttribute('data-orientation', 'vertical');
    expect(block).not.toHaveClass('w-full');
  });

  it('applies grow', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Separator grow />
      </Element>,
    );
    const block = await waitFor(() => {
      const el = container.querySelector('[data-block="Separator"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(block).toHaveClass('flex-1');
  });
});
