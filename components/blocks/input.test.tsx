import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Input } from './input';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

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

describe('Input block in play mode', () => {
  it('is typeable: not readonly, not pointer-events-none, and accepts input', async () => {
    const play = makePlayValue();
    renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Input label="Email" placeholder="you@example.com" />
      </Element>,
      play,
    );
    const input = await screen.findByPlaceholderText('you@example.com');
    expect(input).not.toHaveAttribute('readonly');
    expect(input).not.toHaveAttribute('tabindex', '-1');
    expect(input).not.toHaveClass('pointer-events-none');

    await userEvent.type(input, 'matt@example.com');

    expect(input).toHaveValue('matt@example.com');
  });

  it('becomes really disabled (not just aria-disabled) when disabled is on', async () => {
    const play = makePlayValue();
    renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Input placeholder="Off" disabled />
      </Element>,
      play,
    );
    expect(await screen.findByPlaceholderText('Off')).toBeDisabled();
  });
});

it('connects authored validation text to the invalid input', async () => {
 renderTree(<Element is={LayoutBox} canvas><Input label="Email" invalid errorText="Enter a valid email." /></Element>);
 const input = await screen.findByLabelText('Email');
 expect(input).toHaveAttribute('aria-invalid','true');
 expect(input).toHaveAccessibleDescription('Enter a valid email.');
});
