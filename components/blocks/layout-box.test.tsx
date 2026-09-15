import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, ROOT_NODE } from '@craftjs/core';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';
import { LayoutBox } from './layout-box';

async function findBoxes(container: HTMLElement, count: number) {
  return waitFor(() => {
    const boxes = Array.from(container.querySelectorAll<HTMLElement>('[data-block="LayoutBox"]'));
    expect(boxes).toHaveLength(count);
    return boxes;
  });
}

describe('LayoutBox', () => {
  it('shows the stage empty state when the root has no children', async () => {
    renderTree(<Element is={LayoutBox} canvas />);
    expect(await screen.findByText('This frame is empty')).toBeInTheDocument();
    expect(
      screen.getByText('Drag a component from the Elements panel on the right and drop it here.'),
    ).toBeInTheDocument();
  });

  it('shows the drop placeholder in an empty nested box', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas />
      </Element>,
    );
    expect(await screen.findByText('Drop here')).toBeInTheDocument();
    expect(screen.queryByText('This frame is empty')).not.toBeInTheDocument();
  });

  it('resolves direction from the stage width', async () => {
    const mobile = renderTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas />
      </Element>,
      { width: 375 },
    );
    const [root, inner] = await findBoxes(mobile.container, 2);
    expect(root).toHaveClass('flex-col', 'p-2');
    expect(inner).toHaveClass('flex-col', 'gap-2', 'p-2');
    mobile.unmount();

    const desktop = renderTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas />
      </Element>,
      { width: 1440 },
    );
    const [, innerDesktop] = await findBoxes(desktop.container, 2);
    expect(innerDesktop).toHaveClass('flex-row');
  });

  it('applies grow to nested boxes only', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas grow />
      </Element>,
    );
    const [root, inner] = await findBoxes(container, 2);
    expect(inner).toHaveClass('flex-1');
    expect(root).not.toHaveClass('flex-1');
  });

  it('renders custom pixel spacing exactly and preserves it in serialization', async () => {
    const { container, editor } = renderTree(<Element is={LayoutBox} canvas gapPx={13.5} paddingPx={101} />);
    const [root] = await findBoxes(container, 1);
    expect(root).toHaveStyle({ gap: '13.5px', padding: '101px' });
    const saved = JSON.parse(editor().query.serialize());
    expect(saved.ROOT.props.gapPx).toBe(13.5);
    expect(saved.ROOT.props.paddingPx).toBe(101);
  });

  it('renders the root from its node props, so the inspector can edit it', async () => {
    const { container, editor } = renderTree(<Element is={LayoutBox} canvas />);
    const [root] = await findBoxes(container, 1);
    expect(root).toHaveClass('p-2');
    act(() => {
      editor().actions.setProp(ROOT_NODE, (props: { paddingPx: number; gapPx: number }) => {
        props.paddingPx = 32;
        props.gapPx = 24;
      });
    });
    await waitFor(() => expect(root).toHaveClass('p-8', 'gap-6'));
  });

  // Legacy gap/padding (pre-8px-scale Tailwind units) conversion is covered
  // at the pure-function level in lib/classes.test.ts (normalizeSpacing,
  // snapToSpacing, layoutBoxClasses). It cannot be exercised through this
  // component the way the tests above exercise gapPx/paddingPx: Craft.js
  // merges LayoutBox.craft.props (LAYOUT_BOX_DEFAULTS, which has a concrete
  // gapPx/paddingPx) into any node it creates that is missing those keys,
  // for both <Frame data={...}> deserialization and plain JSX children, so
  // legacy-only props never reach this component still missing gapPx by the
  // time it renders. See the block comment above `merged` in layout-box.tsx.
});

describe('LayoutBox in play mode', () => {
  it('runs its own click interaction on a non-root frame', async () => {
    const play = makePlayValue();
    const { container, editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas />
      </Element>,
      play,
    );
    const boxes = await findBoxes(container, 2);
    const nestedId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    act(() => {
      editor().actions.setCustom(nestedId, (custom: Record<string, unknown>) => {
        custom.interactions = [{ id: 'i1', trigger: 'click', action: 'back' }];
      });
    });
    await waitFor(() => expect(editor().query.node(nestedId).get().data.custom?.interactions).toBeDefined());

    await userEvent.click(boxes[1]);

    expect(play.back).toHaveBeenCalledTimes(1);
  });
});
