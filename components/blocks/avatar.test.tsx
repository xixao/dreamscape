import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Avatar } from './avatar';
import { renderTree } from '@/test/craft-harness';

describe('Avatar block', () => {
  it('renders a fallback with the default initials at medium size', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar />
      </Element>,
    );
    expect(await screen.findByText('AB')).toBeInTheDocument();
    const block = container.querySelector('[data-block="Avatar"]');
    expect(block).toHaveAttribute('data-size', 'default');
  });

  it('renders custom initials', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar initials="MT" />
      </Element>,
    );
    expect(await screen.findByText('MT')).toBeInTheDocument();
  });

  it('maps sm and lg sizes to the installed avatar size prop', async () => {
    const { container: smContainer } = renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar size="sm" />
      </Element>,
    );
    await within(smContainer).findByText('AB');
    expect(smContainer.querySelector('[data-block="Avatar"]')).toHaveAttribute('data-size', 'sm');

    const { container: lgContainer } = renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar size="lg" />
      </Element>,
    );
    await within(lgContainer).findByText('AB');
    expect(lgContainer.querySelector('[data-block="Avatar"]')).toHaveAttribute('data-size', 'lg');
  });

  it('never renders a real image, only the fallback', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar />
      </Element>,
    );
    await screen.findByText('AB');
    expect(container.querySelector('img')).toBeNull();
  });

  it('applies grow', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar grow />
      </Element>,
    );
    await screen.findByText('AB');
    expect(container.querySelector('[data-block="Avatar"]')).toHaveClass('flex-1');
  });
});
