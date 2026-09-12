import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Checkbox } from './checkbox';
import { renderTree } from '@/test/craft-harness';

describe('Checkbox block', () => {
  it('renders the default label, unchecked', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Checkbox />
      </Element>,
    );
    expect(await screen.findByText('Accept the terms')).toBeInTheDocument();
    const box = container.querySelector('[data-block="Checkbox"] button[role="checkbox"]');
    expect(box).not.toBeNull();
    expect(box).toHaveAttribute('aria-checked', 'false');
  });

  it('renders checked when the prop is on', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Checkbox label="Subscribe" checked />
      </Element>,
    );
    await screen.findByText('Subscribe');
    const box = container.querySelector('[data-block="Checkbox"] button[role="checkbox"]');
    expect(box).toHaveAttribute('aria-checked', 'true');
  });

  it('stays selectable: pointer-events-none and no tab focus on the control', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Checkbox />
      </Element>,
    );
    const box = await waitFor(() => {
      const el = container.querySelector('[data-block="Checkbox"] button[role="checkbox"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(box).toHaveClass('pointer-events-none');
    expect(box).toHaveAttribute('tabindex', '-1');
  });

  it('shows disabled as aria-disabled, not native disabled', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Checkbox disabled />
      </Element>,
    );
    const box = await waitFor(() => {
      const el = container.querySelector('[data-block="Checkbox"] button[role="checkbox"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(box).toHaveAttribute('aria-disabled', 'true');
    expect(box).not.toBeDisabled();
    expect(box).toHaveClass('opacity-50');
  });
});
