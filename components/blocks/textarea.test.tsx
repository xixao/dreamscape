import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Textarea } from './textarea';
import { renderTree } from '@/test/craft-harness';

describe('Textarea block', () => {
  it('renders a read-only textarea with its label and placeholder', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Textarea label="Bio" placeholder="Tell us about yourself" rows={5} />
      </Element>,
    );
    const textarea = await screen.findByPlaceholderText('Tell us about yourself');
    expect(textarea).toHaveAttribute('readonly');
    expect(textarea).toHaveAttribute('tabindex', '-1');
    expect(textarea).toHaveAttribute('rows', '5');
    expect(textarea).toHaveClass('pointer-events-none');
    expect(screen.getByText('Bio')).toBeInTheDocument();
    expect(textarea.closest('[data-block="Textarea"]')).not.toBeNull();
  });

  it('hides the label when it is empty and defaults to 3 rows', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Textarea />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Textarea"]')).not.toBeNull());
    expect(container.querySelector('label')).toBeNull();
    const textarea = screen.getByPlaceholderText('Placeholder');
    expect(textarea).toHaveAttribute('rows', '3');
  });

  it('shows disabled as aria-disabled, not native disabled', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Textarea placeholder="Off" disabled />
      </Element>,
    );
    const textarea = await screen.findByPlaceholderText('Off');
    expect(textarea).toHaveAttribute('aria-disabled', 'true');
    expect(textarea).not.toBeDisabled();
    expect(textarea).toHaveClass('opacity-50');
  });
});
