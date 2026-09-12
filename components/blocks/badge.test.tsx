import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, ROOT_NODE } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Badge } from './badge';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('Badge block', () => {
  it('renders the shadcn badge with the default text and variant', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Badge />
      </Element>,
    );
    const badge = await screen.findByText('Badge');
    expect(badge).toHaveAttribute('data-block', 'Badge');
    expect(badge).toHaveAttribute('data-variant', 'default');
  });

  it('renders custom text and every variant', async () => {
    const variants: import('./badge').BadgeVariant[] = ['secondary', 'destructive', 'outline'];
    for (const variant of variants) {
      const { unmount } = renderTree(
        <Element is={LayoutBox} canvas>
          <Badge text={`Status ${variant}`} variant={variant} />
        </Element>,
      );
      const badge = await screen.findByText(`Status ${variant}`);
      expect(badge).toHaveAttribute('data-variant', variant);
      unmount();
    }
  });

  it('applies grow', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Badge grow />
      </Element>,
    );
    expect(await screen.findByText('Badge')).toHaveClass('flex-1');
  });
});

describe('Badge block in play mode', () => {
  it('runs its own click interaction', async () => {
    const play = makePlayValue();
    const { editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Badge text="Click me" />
      </Element>,
      play,
    );
    const badge = await screen.findByText('Click me');
    const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
    act(() => {
      editor().actions.setCustom(id, (custom: Record<string, unknown>) => {
        custom.interactions = [{ id: 'i1', trigger: 'click', action: 'back' }];
      });
    });
    await waitFor(() => expect(editor().query.node(id).get().data.custom?.interactions).toBeDefined());

    await userEvent.click(badge);

    expect(play.back).toHaveBeenCalledTimes(1);
  });
});
