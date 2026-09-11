import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { Element, ROOT_NODE } from '@craftjs/core';
import { renderTree } from '@/test/craft-harness';
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
    expect(await screen.findByText('Nothing on the stage yet')).toBeInTheDocument();
    expect(
      screen.getByText('Drag a component from the Components panel on the left and drop it here.'),
    ).toBeInTheDocument();
  });

  it('shows the drop placeholder in an empty nested box', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas />
      </Element>,
    );
    expect(await screen.findByText('Drop here')).toBeInTheDocument();
    expect(screen.queryByText('Nothing on the stage yet')).not.toBeInTheDocument();
  });

  it('resolves direction from the stage width', async () => {
    const mobile = renderTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas />
      </Element>,
      { width: 375 },
    );
    const [root, inner] = await findBoxes(mobile.container, 2);
    expect(root).toHaveClass('flex-col', 'p-6');
    expect(inner).toHaveClass('flex-col', 'gap-4', 'p-4');
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

  it('renders the root from its node props, so the inspector can edit it', async () => {
    const { container, editor } = renderTree(<Element is={LayoutBox} canvas />);
    const [root] = await findBoxes(container, 1);
    expect(root).toHaveClass('p-6');
    act(() => {
      editor().actions.setProp(ROOT_NODE, (props: { padding: number; gap: number }) => {
        props.padding = 8;
        props.gap = 2;
      });
    });
    await waitFor(() => expect(root).toHaveClass('p-8', 'gap-2'));
  });
});
