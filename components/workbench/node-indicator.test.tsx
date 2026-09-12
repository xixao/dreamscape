import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Editor, Element, Frame, ROOT_NODE, useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { Button } from '@/components/blocks/button';
import { LayoutBox } from '@/components/blocks/layout-box';
import { resolver } from '@/components/blocks/registry';
import { StageProvider } from './stage-context';
import { NodeIndicator, SelectionOutline } from './node-indicator';

type EditorHandle = { actions: ReturnType<typeof useEditor>['actions']; query: ReturnType<typeof useEditor>['query'] };

describe('SelectionOutline', () => {
  it('positions itself from the rect and shows the label only when selected', () => {
    const rect = { top: 10, left: 20, width: 100, height: 40 } as DOMRect;
    const { rerender } = render(
      <SelectionOutline rect={rect} color="var(--acc)" label="Button" weight="selected" />,
    );
    const outline = screen.getByTestId('selection-outline');
    expect(outline).toHaveStyle({ top: '10px', left: '20px', width: '100px', height: '40px' });
    expect(outline).toHaveAttribute('data-weight', 'selected');
    expect(screen.getByText('Button')).toBeInTheDocument();

    rerender(<SelectionOutline rect={rect} color="var(--acc)" label="Button" weight="hover" />);
    expect(screen.queryByText('Button')).toBeNull();
  });
});

describe('NodeIndicator', () => {
  function Selector({ pick }: { pick: 'first-child' | 'root' }) {
    const { actions, query } = useEditor();
    useEffect(() => {
      const id = pick === 'root' ? ROOT_NODE : query.node(ROOT_NODE).get().data.nodes[0];
      if (id) actions.selectNode(id);
    }, [actions, query, pick]);
    return null;
  }

  it('draws a selected outline for a block but never for the root', async () => {
    render(
      <Editor resolver={resolver} onRender={NodeIndicator}>
        <StageProvider>
          <Frame>
            <Element is={LayoutBox} canvas>
              <Button label="Pick me" />
            </Element>
          </Frame>
          <Selector pick="first-child" />
        </StageProvider>
      </Editor>,
    );
    await screen.findByRole('button', { name: 'Pick me' });
    const outline = await screen.findByTestId('selection-outline');
    expect(outline).toHaveAttribute('data-weight', 'selected');
    expect(outline).toHaveTextContent('Button');
  });

  it('draws nothing when only the root is selected', async () => {
    render(
      <Editor resolver={resolver} onRender={NodeIndicator}>
        <StageProvider>
          <Frame>
            <Element is={LayoutBox} canvas>
              <Button label="Alone" />
            </Element>
          </Frame>
          <Selector pick="root" />
        </StageProvider>
      </Editor>,
    );
    await screen.findByRole('button', { name: 'Alone' });
    await waitFor(() => expect(screen.queryByTestId('selection-outline')).toBeNull());
  });

  it('shows the displayName, not the resolver name, in the outline tag for a nested LayoutBox', async () => {
    render(
      <Editor resolver={resolver} onRender={NodeIndicator}>
        <StageProvider>
          <Frame>
            <Element is={LayoutBox} canvas>
              <Element is={LayoutBox} canvas />
            </Element>
          </Frame>
          <Selector pick="first-child" />
        </StageProvider>
      </Editor>,
    );
    await screen.findByText('Drop here');
    const outline = await screen.findByTestId('selection-outline');
    expect(outline).toHaveAttribute('data-weight', 'selected');
    expect(outline).toHaveTextContent('Frame');
  });
});

describe('NodeIndicator re-measurement', () => {
  afterEach(() => vi.restoreAllMocks());

  it('re-reads the rect when a node is added elsewhere in the tree, even though the selected node itself never resizes', async () => {
    // jsdom never fires ResizeObserver for real (vitest.setup.ts stubs it out
    // entirely), so the only way this test can see a second measurement is if
    // something else in the dependency array changed and re-ran the effect.
    let top = 1;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top,
          left: 0,
          width: 10,
          height: 10,
          right: 10,
          bottom: top + 10,
          x: 0,
          y: top,
          toJSON() {},
        }) as DOMRect,
    );

    let handle: EditorHandle | null = null;
    function Probe() {
      const { actions, query } = useEditor();
      useEffect(() => {
        handle = { actions, query };
      });
      return null;
    }
    function SelectFirstChild() {
      const { actions, query } = useEditor();
      useEffect(() => {
        const id = query.node(ROOT_NODE).get().data.nodes[0];
        if (id) actions.selectNode(id);
      }, [actions, query]);
      return null;
    }

    render(
      <Editor resolver={resolver} onRender={NodeIndicator}>
        <StageProvider>
          <Frame>
            <Element is={LayoutBox} canvas>
              <Button label="Pick me" />
            </Element>
          </Frame>
          <SelectFirstChild />
          <Probe />
        </StageProvider>
      </Editor>,
    );
    await screen.findByRole('button', { name: 'Pick me' });
    const outline = await screen.findByTestId('selection-outline');
    await waitFor(() => expect(outline).toHaveStyle({ top: '1px' }));

    top = 42;
    act(() => {
      const tree = handle!.query.parseReactElement(<Button label="New" />).toNodeTree();
      handle!.actions.addNodeTree(tree, ROOT_NODE);
    });
    await screen.findByRole('button', { name: 'New' });
    await waitFor(() => expect(outline).toHaveStyle({ top: '42px' }));
  });
});
