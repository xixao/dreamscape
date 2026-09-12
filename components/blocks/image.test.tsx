/* eslint-disable jsx-a11y/alt-text -- `Image` here is this file's own block (components/blocks/image.tsx),
   not next/image's Image; jsx-a11y matches the component name and does not know the difference. */
import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, ROOT_NODE } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Image } from './image';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('Image block', () => {
  it('renders a muted placeholder box with the default label and a square aspect', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Image />
      </Element>,
    );
    const block = container.querySelector('[data-block="Image"]');
    expect(block).not.toBeNull();
    expect(block).toHaveClass('bg-muted', 'aspect-square', 'rounded-md', 'w-full');
    expect(await screen.findByText('Image')).toBeInTheDocument();
    expect(block?.querySelector('svg')).not.toBeNull();
  });

  it('uses a custom label', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Image label="Hero photo" />
      </Element>,
    );
    expect(await screen.findByText('Hero photo')).toBeInTheDocument();
  });

  it('applies the aspect ratio class for each option', async () => {
    const cases: Array<[import('./image').ImageAspect, string]> = [
      ['video', 'aspect-video'],
      ['portrait', 'aspect-[3/4]'],
      ['wide', 'aspect-[21/9]'],
    ];
    for (const [aspect, className] of cases) {
      const { container, unmount } = renderTree(
        <Element is={LayoutBox} canvas>
          <Image aspect={aspect} />
        </Element>,
      );
      await screen.findByText('Image');
      expect(container.querySelector('[data-block="Image"]')).toHaveClass(className);
      unmount();
    }
  });

  it('applies the radius class for each option', async () => {
    const cases: Array<[import('./image').ImageRadius, string]> = [
      ['none', 'rounded-none'],
      ['lg', 'rounded-lg'],
      ['full', 'rounded-full'],
    ];
    for (const [radius, className] of cases) {
      const { container, unmount } = renderTree(
        <Element is={LayoutBox} canvas>
          <Image radius={radius} />
        </Element>,
      );
      await screen.findByText('Image');
      expect(container.querySelector('[data-block="Image"]')).toHaveClass(className);
      unmount();
    }
  });

  it('applies grow', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Image grow />
      </Element>,
    );
    await screen.findByText('Image');
    expect(container.querySelector('[data-block="Image"]')).toHaveClass('flex-1');
  });
});

describe('Image block in play mode', () => {
  it('runs its own click interaction', async () => {
    const play = makePlayValue();
    const { container, editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Image />
      </Element>,
      play,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Image"]')).not.toBeNull());
    const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
    act(() => {
      editor().actions.setCustom(id, (custom: Record<string, unknown>) => {
        custom.interactions = [{ id: 'i1', trigger: 'click', action: 'back' }];
      });
    });
    await waitFor(() => expect(editor().query.node(id).get().data.custom?.interactions).toBeDefined());

    await userEvent.click(container.querySelector('[data-block="Image"]')!);

    expect(play.back).toHaveBeenCalledTimes(1);
  });
});
