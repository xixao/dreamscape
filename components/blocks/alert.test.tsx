import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Alert } from './alert';
import { renderTree } from '@/test/craft-harness';

describe('Alert block', () => {
  it('renders the default title and description', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Alert />
      </Element>,
    );
    expect(await screen.findByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('You can add components to this alert.')).toBeInTheDocument();
    const block = container.querySelector('[data-block="Alert"]');
    expect(block).toHaveAttribute('role', 'alert');
  });

  it('hides the description when it is empty', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Alert description="" />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Alert"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="alert-description"]')).toBeNull();
  });

  it('applies the destructive variant', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Alert variant="destructive" title="Something broke" />
      </Element>,
    );
    await screen.findByText('Something broke');
    expect(container.querySelector('[data-block="Alert"]')).toHaveClass('text-destructive');
  });

  it('applies grow', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Alert grow />
      </Element>,
    );
    await screen.findByText('Heads up');
    expect(container.querySelector('[data-block="Alert"]')).toHaveClass('flex-1');
  });
});
