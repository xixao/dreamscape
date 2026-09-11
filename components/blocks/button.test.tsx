import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Button } from './button';
import { renderTree } from '@/test/craft-harness';

describe('Button block', () => {
  it('renders the shadcn button with label, variant and size', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button label="Save changes" variant="destructive" size="sm" />
      </Element>,
    );
    const button = await screen.findByRole('button', { name: 'Save changes' });
    expect(button).toHaveAttribute('data-block', 'Button');
    expect(button).toHaveClass('bg-destructive/10');
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('uses the defaults when no props are given', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button />
      </Element>,
    );
    const button = await screen.findByRole('button', { name: 'Button' });
    expect(button).toHaveClass('bg-primary');
  });

  it('shows disabled as aria-disabled so it stays selectable', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button label="Off" disabled />
      </Element>,
    );
    const button = await screen.findByRole('button', { name: 'Off' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveClass('opacity-50');
  });

  it('applies grow', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button label="Wide" grow />
      </Element>,
    );
    expect(await screen.findByRole('button', { name: 'Wide' })).toHaveClass('flex-1');
  });
});
