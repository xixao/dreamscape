import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Switch } from './switch';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('Switch block', () => {
  it('renders the default label, off', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Switch />
      </Element>,
    );
    expect(await screen.findByText('Enable notifications')).toBeInTheDocument();
    const toggle = container.querySelector('[data-block="Switch"] button[role="switch"]');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('renders on when checked', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Switch label="Dark mode" checked />
      </Element>,
    );
    await screen.findByText('Dark mode');
    const toggle = container.querySelector('[data-block="Switch"] button[role="switch"]');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('stays selectable: pointer-events-none and no tab focus', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Switch />
      </Element>,
    );
    const toggle = await waitFor(() => {
      const el = container.querySelector('[data-block="Switch"] button[role="switch"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(toggle).toHaveClass('pointer-events-none');
    expect(toggle).toHaveAttribute('tabindex', '-1');
  });

  it('shows disabled as aria-disabled, not native disabled', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Switch disabled />
      </Element>,
    );
    const toggle = await waitFor(() => {
      const el = container.querySelector('[data-block="Switch"] button[role="switch"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).not.toBeDisabled();
    expect(toggle).toHaveClass('opacity-50');
  });
});

describe('Switch block in play mode', () => {
  it('toggles when clicked: not pointer-events-none, real tab focus', async () => {
    const play = makePlayValue();
    const { container } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Switch label="Dark mode" />
      </Element>,
      play,
    );
    const toggle = await waitFor(() => {
      const el = container.querySelector('[data-block="Switch"] button[role="switch"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(toggle).not.toHaveClass('pointer-events-none');
    expect(toggle).not.toHaveAttribute('tabindex', '-1');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('becomes really disabled (not just aria-disabled) when disabled is on', async () => {
    const play = makePlayValue();
    const { container } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Switch disabled />
      </Element>,
      play,
    );
    const toggle = await waitFor(() => {
      const el = container.querySelector('[data-block="Switch"] button[role="switch"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(toggle).toBeDisabled();
  });
});
