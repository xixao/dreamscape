import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { RadioGroup } from './radio-group';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('RadioGroup block', () => {
  it('renders the default options with the first selected', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <RadioGroup />
      </Element>,
    );
    expect(await screen.findByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
    const radios = container.querySelectorAll('[data-block="RadioGroup"] button[role="radio"]');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('selects the option at the given 1-based index', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <RadioGroup options="Small, Medium, Large" selected={2} />
      </Element>,
    );
    await screen.findByText('Medium');
    const radios = container.querySelectorAll('[data-block="RadioGroup"] button[role="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAttribute('aria-checked', 'false');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[2]).toHaveAttribute('aria-checked', 'false');
  });

  it('clamps an out-of-range selected index to the last option', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <RadioGroup options="One, Two" selected={4} />
      </Element>,
    );
    await screen.findByText('Two');
    const radios = container.querySelectorAll('[data-block="RadioGroup"] button[role="radio"]');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
  });

  it('shows a group label when given', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <RadioGroup label="Size" />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-block="RadioGroup"]')).not.toBeNull());
    expect(screen.getByText('Size')).toBeInTheDocument();
  });

  it('keeps every item pointer-events-none and untabbable', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <RadioGroup />
      </Element>,
    );
    const radios = await waitFor(() => {
      const els = container.querySelectorAll('[data-block="RadioGroup"] button[role="radio"]');
      expect(els.length).toBeGreaterThan(0);
      return els;
    });
    for (const radio of radios) {
      expect(radio).toHaveAttribute('tabindex', '-1');
    }
    expect(container.querySelector('[role="radiogroup"]')).toHaveClass('pointer-events-none');
  });

  it('shows disabled as aria-disabled on the group, not native disabled', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <RadioGroup disabled />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[role="radiogroup"]')).not.toBeNull());
    const group = container.querySelector('[role="radiogroup"]')!;
    expect(group).toHaveAttribute('aria-disabled', 'true');
    expect(group).toHaveClass('opacity-50');
  });
});

describe('RadioGroup block in play mode', () => {
  it('selects an option when clicked: not pointer-events-none, real tab focus', async () => {
    const play = makePlayValue();
    const { container } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <RadioGroup options="Small, Medium, Large" />
      </Element>,
      play,
    );
    const radios = await waitFor(() => {
      const els = container.querySelectorAll('[data-block="RadioGroup"] button[role="radio"]');
      expect(els.length).toBe(3);
      return els;
    });
    expect(container.querySelector('[role="radiogroup"]')).not.toHaveClass('pointer-events-none');
    for (const radio of radios) {
      expect(radio).not.toHaveAttribute('tabindex', '-1');
    }
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(radios[2]);

    expect(radios[2]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAttribute('aria-checked', 'false');
  });

  it('becomes really disabled (not just aria-disabled) when disabled is on', async () => {
    const play = makePlayValue();
    const { container } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <RadioGroup disabled />
      </Element>,
      play,
    );
    // The group root renders as a plain div (role="radiogroup" is not a
    // native form control jest-dom's toBeDisabled recognizes); Radix
    // propagates a disabled Root to each item button, which does render as
    // a real <button>, so that is what a "really disabled" assertion checks.
    const radio = await waitFor(() => {
      const el = container.querySelector('[data-block="RadioGroup"] button[role="radio"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(radio).toBeDisabled();
  });
});
