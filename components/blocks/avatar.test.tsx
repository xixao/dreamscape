import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, ROOT_NODE } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Avatar } from './avatar';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('Avatar block', () => {
  it('renders a fallback with the default initials at medium size', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar />
      </Element>,
    );
    expect(await screen.findByText('AB')).toBeInTheDocument();
    const block = container.querySelector('[data-block="Avatar"]');
    expect(block).toHaveAttribute('data-size', 'default');
  });

  it('renders custom initials', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar initials="MT" />
      </Element>,
    );
    expect(await screen.findByText('MT')).toBeInTheDocument();
  });

  it('maps sm and lg sizes to the installed avatar size prop', async () => {
    const { container: smContainer } = renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar size="sm" />
      </Element>,
    );
    await within(smContainer).findByText('AB');
    expect(smContainer.querySelector('[data-block="Avatar"]')).toHaveAttribute('data-size', 'sm');

    const { container: lgContainer } = renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar size="lg" />
      </Element>,
    );
    await within(lgContainer).findByText('AB');
    expect(lgContainer.querySelector('[data-block="Avatar"]')).toHaveAttribute('data-size', 'lg');
  });

  it('never renders a real image, only the fallback', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar />
      </Element>,
    );
    await screen.findByText('AB');
    expect(container.querySelector('img')).toBeNull();
  });

  it('applies grow', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Avatar grow />
      </Element>,
    );
    await screen.findByText('AB');
    expect(container.querySelector('[data-block="Avatar"]')).toHaveClass('flex-1');
  });
});

describe('Avatar block in play mode', () => {
  it('runs its own click interaction', async () => {
    const play = makePlayValue();
    const { container, editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Avatar />
      </Element>,
      play,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Avatar"]')).not.toBeNull());
    const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
    act(() => {
      editor().actions.setCustom(id, (custom: Record<string, unknown>) => {
        custom.interactions = [{ id: 'i1', trigger: 'click', action: 'back' }];
      });
    });
    await waitFor(() => expect(editor().query.node(id).get().data.custom?.interactions).toBeDefined());

    await userEvent.click(container.querySelector('[data-block="Avatar"]')!);

    expect(play.back).toHaveBeenCalledTimes(1);
  });
});
