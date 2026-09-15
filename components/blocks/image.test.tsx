/* eslint-disable jsx-a11y/alt-text -- `Image` here is this file's own block (components/blocks/image.tsx),
   not next/image's Image; jsx-a11y matches the component name and does not know the difference. */
import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
    expect(block).toHaveClass('w-full');
    expect(block?.querySelector('[data-image-surface]')).toHaveClass('bg-muted', 'aspect-square', 'rounded-md');
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
      expect(container.querySelector('[data-image-surface]')).toHaveClass(className);
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
      expect(container.querySelector('[data-image-surface]')).toHaveClass(className);
      unmount();
    }
  });

  it('updates the ratio surface independently of its flex layout wrapper', () => {
    const { container, editor } = renderTree(<Element is={LayoutBox} canvas direction={{ mobile: 'row' }}><Image grow /></Element>);
    const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
    const surface = container.querySelector('[data-image-surface]') as HTMLElement;
    expect(surface.style.aspectRatio).toBe('1 / 1');
    act(() => editor().actions.setProp(id, props => { props.aspect = 'wide'; }));
    expect(surface.style.aspectRatio).toBe('21 / 9');
    expect(surface).not.toHaveClass('flex-1');
    expect(container.querySelector('[data-block="Image"]')).toHaveClass('flex-1');
    act(() => editor().actions.setProp(id, props => { props.aspect = 'portrait'; }));
    expect(surface.style.aspectRatio).toBe('3 / 4');
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

it('renders a real image with alt text inside the selected aspect and radius', async () => {
  const { container } = renderTree(<Element is={LayoutBox} canvas><Image src="https://example.com/photo.jpg" alt="Mountain lake" aspect="video" radius="lg" /></Element>);
  const image = await screen.findByRole('img', { name: 'Mountain lake' });
  expect(image).toHaveAttribute('src', 'https://example.com/photo.jpg');
  expect(image).toHaveClass('object-cover');
  expect(container.querySelector('[data-image-surface]')).toHaveClass('aspect-video', 'rounded-lg');
  expect(screen.queryByText('Image')).toBeNull();
});

it('resizes a selected image with a zoomed pointer drag and preserves locked proportions', async () => {
  const view = renderTree(<Element is={LayoutBox} canvas><Image size={{ width: 200, height: 100, locked: true }} /></Element>);
  const id = view.editor().query.node(ROOT_NODE).get().data.nodes[0];
  act(() => view.editor().actions.selectNode(id));
  const block = view.container.querySelector('[data-block="Image"]') as HTMLElement;
  Object.defineProperties(block, { offsetWidth: { configurable: true, value: 200 }, offsetHeight: { configurable: true, value: 100 } });
  block.getBoundingClientRect = () => ({ width: 100, height: 50, top: 0, left: 0, bottom: 50, right: 100, x: 0, y: 0, toJSON() {} });
  const handle = await screen.findByRole('button', { name: 'Resize image corner' });
  handle.setPointerCapture = () => {};
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 50 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 125, clientY: 75 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
  expect(view.editor().query.node(id).get().data.props.size).toEqual({ width: 250, height: 125, locked: true });
});

it('keeps an automatic image at its intrinsic width when its parent grows', async () => {
  const view = renderTree(<Element is={LayoutBox} canvas><Image src="https://example.com/logo.png" alt="Logo" /></Element>);
  const image = await screen.findByRole('img', { name: 'Logo' });
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 225 });
  fireEvent.load(image);
  const block = view.container.querySelector('[data-block="Image"]');
  expect(block).toHaveStyle({ width: '225px', flexShrink: '0' });
  expect(block).not.toHaveClass('self-start');
  act(() => view.editor().actions.setProp(ROOT_NODE, props => { props.widthMode = 'fixed'; props.widthPx = 900; }));
  expect(block).toHaveStyle({ width: '225px' });
});
