import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, ROOT_NODE } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Alert } from './alert';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('Alert block', () => {
  it('renders the default title and description', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Alert />
      </Element>,
    );
    expect(await screen.findByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('You can add components to this alert.')).toBeInTheDocument();
    const block = container.querySelector('[data-block="Alert"]');
    expect(block).toHaveAttribute('role', 'alert');
  });

  it('hides the description when it is empty', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Alert description="" />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Alert"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="alert-description"]')).toBeNull();
  });

  it('applies the destructive variant', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Alert variant="destructive" title="Something broke" />
      </Element>,
    );
    await screen.findByText('Something broke');
    expect(container.querySelector('[data-block="Alert"]')).toHaveClass('text-destructive');
  });

  it('applies grow', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Alert grow />
      </Element>,
    );
    await screen.findByText('Heads up');
    expect(container.querySelector('[data-block="Alert"]')).toHaveClass('flex-1');
  });
});

describe('Alert block in play mode', () => {
  it('runs its own click interaction', async () => {
    const play = makePlayValue();
    const { container, editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Alert />
      </Element>,
      play,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Alert"]')).not.toBeNull());
    const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
    act(() => {
      editor().actions.setCustom(id, (custom: Record<string, unknown>) => {
        custom.interactions = [{ id: 'i1', trigger: 'click', action: 'back' }];
      });
    });
    await waitFor(() => expect(editor().query.node(id).get().data.custom?.interactions).toBeDefined());

    await userEvent.click(container.querySelector('[data-block="Alert"]')!);

    expect(play.back).toHaveBeenCalledTimes(1);
  });
});
