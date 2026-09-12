import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Editor, Element, Frame, ROOT_NODE, useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { Button } from '@/components/blocks/button';
import { LayoutBox } from '@/components/blocks/layout-box';
import { resolver } from '@/components/blocks/registry';
import { StageProvider } from './stage-context';
import { NodeIndicator, SelectionOutline } from './node-indicator';

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
});
