import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Input } from './input';
import { renderTree } from '@/test/craft-harness';

describe('Input block', () => {
  it('renders a read-only input with its label and placeholder', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Input label="Email" placeholder="you@example.com" type="email" />
      </Element>,
    );
    const input = await screen.findByPlaceholderText('you@example.com');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).toHaveClass('pointer-events-none');
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(input.closest('[data-block="Input"]')).not.toBeNull();
  });

  it('hides the label when it is empty', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Input />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Input"]')).not.toBeNull());
    expect(container.querySelector('label')).toBeNull();
    expect(screen.getByPlaceholderText('Placeholder')).toBeInTheDocument();
  });

  it('shows disabled as aria-disabled', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Input placeholder="Off" disabled />
      </Element>,
    );
    const input = await screen.findByPlaceholderText('Off');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).not.toBeDisabled();
  });
});
