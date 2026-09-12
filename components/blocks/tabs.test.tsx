import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Tabs } from './tabs';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('Tabs block', () => {
  it('renders the default tabs with the first one active and an empty content zone', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Tabs />
      </Element>,
    );
    expect(await screen.findByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Overview').closest('[role="tab"]')).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Details').closest('[role="tab"]')).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByText('Drop here')).toBeInTheDocument();
    expect(container.querySelector('[data-block="Tabs"] [data-zone="TabsContent"]')).not.toBeNull();
  });

  it('marks the tab at the given 1-based active index as active', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Tabs tabs="Alpha, Beta, Gamma" active={2} />
      </Element>,
    );
    expect((await screen.findByText('Beta')).closest('[role="tab"]')).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Alpha').closest('[role="tab"]')).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByText('Gamma').closest('[role="tab"]')).toHaveAttribute('data-state', 'inactive');
  });

  it('keeps every trigger pointer-events-none so a click selects the block', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Tabs />
      </Element>,
    );
    const triggers = await waitFor(() => {
      const els = container.querySelectorAll('[role="tab"]');
      expect(els.length).toBeGreaterThan(0);
      return els;
    });
    for (const trigger of triggers) {
      expect(trigger).toHaveClass('pointer-events-none');
      expect(trigger).toHaveAttribute('tabindex', '-1');
    }
  });

  it('shows content once a child is added and cannot drag the content zone', async () => {
    const { container, editor } = renderTree(
      <Element is={LayoutBox} canvas>
        <Tabs />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-zone="TabsContent"]')).not.toBeNull());
    const tabsId = editor().query.node('ROOT').get().data.nodes[0];
    const zoneId = editor().query.node(tabsId).get().data.linkedNodes.content;
    expect(editor().query.node(zoneId).isDraggable()).toBe(false);
    expect(editor().query.node(tabsId).isDraggable()).toBe(true);
  });

  it('applies grow', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Tabs grow />
      </Element>,
    );
    await screen.findByText('Overview');
    expect(container.querySelector('[data-block="Tabs"]')).toHaveClass('flex-1');
  });
});

describe('Tabs block in play mode', () => {
  it('switches the active tab when a different trigger is clicked', async () => {
    const play = makePlayValue();
    renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Tabs tabs="Alpha, Beta, Gamma" />
      </Element>,
      play,
    );
    const alpha = (await screen.findByText('Alpha')).closest('[role="tab"]')!;
    const beta = screen.getByText('Beta').closest('[role="tab"]')!;
    expect(alpha).toHaveAttribute('data-state', 'active');
    expect(beta).not.toHaveClass('pointer-events-none');
    expect(beta).not.toHaveAttribute('tabindex', '-1');

    await userEvent.click(beta);

    expect(beta).toHaveAttribute('data-state', 'active');
    expect(alpha).toHaveAttribute('data-state', 'inactive');
  });
});
