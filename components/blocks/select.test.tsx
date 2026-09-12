import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Select } from './select';
import { renderTree } from '@/test/craft-harness';

describe('Select block', () => {
  it('renders only the trigger with the placeholder, no dropdown content', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Select label="Country" />
      </Element>,
    );
    expect(await screen.findByText('Select an option')).toBeInTheDocument();
    expect(screen.getByText('Country')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="select-trigger"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="select-content"]')).toBeNull();
    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it('keeps the trigger pointer-events-none so a click selects the block', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Select />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-slot="select-trigger"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="select-trigger"]')).toHaveClass('pointer-events-none');
  });

  it('hides the label when empty and shows a custom placeholder', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Select placeholder="Choose a plan" />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Select"]')).not.toBeNull());
    expect(container.querySelector('label')).toBeNull();
    expect(screen.getByText('Choose a plan')).toBeInTheDocument();
  });

  it('shows disabled as aria-disabled, not native disabled', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Select disabled />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-slot="select-trigger"]')).not.toBeNull());
    const trigger = container.querySelector('[data-slot="select-trigger"]')!;
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveClass('opacity-50');
    expect(trigger).not.toHaveAttribute('disabled');
  });
});
