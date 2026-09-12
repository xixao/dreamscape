import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Slider, clampPercent } from './slider';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('clampPercent', () => {
  it('clamps into 0..100 and falls back to 0 for invalid text', () => {
    expect(clampPercent('50')).toBe(50);
    expect(clampPercent('-5')).toBe(0);
    expect(clampPercent('200')).toBe(100);
    expect(clampPercent('abc')).toBe(0);
  });
});

describe('Slider block', () => {
  it('renders at the default value of 50 with no label', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Slider />
      </Element>,
    );
    const thumb = await waitFor(() => {
      const el = container.querySelector('[data-block="Slider"] [role="slider"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(thumb).toHaveAttribute('aria-valuenow', '50');
    expect(container.querySelector('label')).toBeNull();
  });

  it('parses a custom value prop', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Slider label="Volume" value="30" />
      </Element>,
    );
    await screen.findByText('Volume');
    const thumb = container.querySelector('[data-block="Slider"] [role="slider"]');
    expect(thumb).toHaveAttribute('aria-valuenow', '30');
  });

  it('clamps an out-of-range value', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Slider value="500" />
      </Element>,
    );
    const thumb = await waitFor(() => {
      const el = container.querySelector('[data-block="Slider"] [role="slider"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(thumb).toHaveAttribute('aria-valuenow', '100');
  });

  it('keeps the track pointer-events-none so a click selects the block', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Slider />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-slot="slider"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="slider"]')).toHaveClass('pointer-events-none');
  });

  it('shows disabled as aria-disabled, not native disabled', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Slider disabled />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-slot="slider"]')).not.toBeNull());
    const slider = container.querySelector('[data-slot="slider"]')!;
    expect(slider).toHaveAttribute('aria-disabled', 'true');
    expect(slider).toHaveClass('opacity-50');
  });

  it('applies grow to the wrapper', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Slider grow />
      </Element>,
    );
    const block = await waitFor(() => {
      const el = container.querySelector('[data-block="Slider"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(block).toHaveClass('flex-1');
  });
});

describe('Slider block in play mode', () => {
  it('is interactive: not pointer-events-none, and responds to keyboard input', async () => {
    const play = makePlayValue();
    const { container } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Slider value="50" />
      </Element>,
      play,
    );
    const thumb = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('[data-block="Slider"] [role="slider"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(container.querySelector('[data-slot="slider"]')).not.toHaveClass('pointer-events-none');
    expect(thumb).toHaveAttribute('aria-valuenow', '50');

    await userEvent.click(thumb);
    await userEvent.keyboard('{ArrowRight}');

    expect(thumb).toHaveAttribute('aria-valuenow', '51');
  });

  it('becomes really disabled when disabled is on', async () => {
    const play = makePlayValue();
    const { container } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Slider disabled />
      </Element>,
      play,
    );
    await waitFor(() => expect(container.querySelector('[data-slot="slider"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="slider"]')).toHaveAttribute('data-disabled');
  });
});
