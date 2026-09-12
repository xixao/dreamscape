import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Badge } from './badge';
import { renderTree } from '@/test/craft-harness';

describe('Badge block', () => {
  it('renders the shadcn badge with the default text and variant', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Badge />
      </Element>,
    );
    const badge = await screen.findByText('Badge');
    expect(badge).toHaveAttribute('data-block', 'Badge');
    expect(badge).toHaveAttribute('data-variant', 'default');
  });

  it('renders custom text and every variant', async () => {
    const variants: import('./badge').BadgeVariant[] = ['secondary', 'destructive', 'outline'];
    for (const variant of variants) {
      const { unmount } = renderTree(
        <Element is={LayoutBox} canvas>
          <Badge text={`Status ${variant}`} variant={variant} />
        </Element>,
      );
      const badge = await screen.findByText(`Status ${variant}`);
      expect(badge).toHaveAttribute('data-variant', variant);
      unmount();
    }
  });

  it('applies grow', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Badge grow />
      </Element>,
    );
    expect(await screen.findByText('Badge')).toHaveClass('flex-1');
  });
});
