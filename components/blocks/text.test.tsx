import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, ROOT_NODE } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Text } from './text';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('Text block', () => {
  it('edits on double click and saves only text as an undoable change', async () => {
    const { editor } = renderTree(<Element is={LayoutBox} canvas><Text text="Original" role="heading2" align={{ mobile: 'center' }} /></Element>);
    const node = await screen.findByText('Original');
    const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
    const before = { ...editor().query.node(id).get().data.props };
    await userEvent.dblClick(node);
    expect(node).toHaveAttribute('contenteditable', 'true');
    node.textContent = 'Updated copy';
    fireEvent.input(node);
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(editor().query.node(id).get().data.props).toEqual({ ...before, text: 'Updated copy' });
    act(() => editor().actions.history.undo());
    await waitFor(() => expect(node).toHaveTextContent('Original'));
    act(() => editor().actions.history.redo());
    await waitFor(() => expect(node).toHaveTextContent('Updated copy'));
  });

  it('cancels with Escape and commits on blur', async () => {
    const { editor } = renderTree(<Element is={LayoutBox} canvas><Text text="Original" /></Element>);
    const node = await screen.findByText('Original');
    const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
    await userEvent.dblClick(node);
    node.textContent = 'Discard';
    fireEvent.keyDown(node, { key: 'Escape' });
    expect(node).toHaveTextContent('Original');
    expect(editor().query.node(id).get().data.props.text).toBe('Original');
    await userEvent.dblClick(node);
    node.textContent = 'Saved on blur';
    fireEvent.blur(node);
    expect(editor().query.node(id).get().data.props.text).toBe('Saved on blur');
  });

  it('does not enable editing in a prototype', async () => {
    renderPlayTree(<Element is={LayoutBox} canvas><Text text="Read only" /></Element>);
    const node = await screen.findByText('Read only');
    await userEvent.dblClick(node);
    expect(node).toHaveAttribute('contenteditable', 'false');
  });

  it('renders a paragraph with the default text when no props are given', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Text />
      </Element>,
    );
    const node = await screen.findByText('Text');
    expect(node.tagName).toBe('P');
    expect(node).toHaveAttribute('data-block', 'Text');
    expect(node).toHaveClass('text-base', 'text-left');
  });

  it('renders each role as the matching heading tag with its size classes', async () => {
    const cases: Array<[import('./text').TextRole, string, string]> = [
      ['heading1', 'H1', 'text-4xl'],
      ['heading2', 'H2', 'text-2xl'],
      ['heading3', 'H3', 'text-lg'],
      ['caption', 'P', 'text-sm'],
    ];
    for (const [role, tag, sizeClass] of cases) {
      const { unmount, container } = renderTree(
        <Element is={LayoutBox} canvas>
          <Text text={`Role ${role}`} role={role} />
        </Element>,
      );
      const node = await screen.findByText(`Role ${role}`);
      expect(node.tagName).toBe(tag);
      expect(node).toHaveClass(sizeClass);
      unmount();
      expect(container.querySelector(`[data-block="Text"]`)).toBeNull();
    }
  });

  it('applies center and end alignment as text-center and text-right', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Text text="Centered" align={{ mobile: 'center' }} />
      </Element>,
    );
    expect(await screen.findByText('Centered')).toHaveClass('text-center');

    renderTree(
      <Element is={LayoutBox} canvas>
        <Text text="Ended" align={{ mobile: 'end' }} />
      </Element>,
    );
    expect(await screen.findByText('Ended')).toHaveClass('text-right');
  });

  it('resolves align from the stage breakpoint, falling back to mobile', async () => {
    const mobile = renderTree(
      <Element is={LayoutBox} canvas>
        <Text text="Responsive" align={{ mobile: 'start', desktop: 'end' }} />
      </Element>,
      { width: 375 },
    );
    expect(await screen.findByText('Responsive')).toHaveClass('text-left');
    mobile.unmount();

    renderTree(
      <Element is={LayoutBox} canvas>
        <Text text="Responsive" align={{ mobile: 'start', desktop: 'end' }} />
      </Element>,
      { width: 1440 },
    );
    expect(await screen.findByText('Responsive')).toHaveClass('text-right');
  });

  it('adds text-muted-foreground when muted is on', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Text text="Quiet" muted />
      </Element>,
    );
    expect(await screen.findByText('Quiet')).toHaveClass('text-muted-foreground');
  });

  it('applies grow', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Text text="Grown" grow />
      </Element>,
    );
    expect(await screen.findByText('Grown')).toHaveClass('flex-1');
  });
});

describe('Text block in play mode', () => {
  it('runs its own click interaction', async () => {
    const play = makePlayValue();
    const { editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Text text="Click me" />
      </Element>,
      play,
    );
    const textNode = await screen.findByText('Click me');
    const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
    act(() => {
      editor().actions.setCustom(id, (custom: Record<string, unknown>) => {
        custom.interactions = [{ id: 'i1', trigger: 'click', action: 'back' }];
      });
    });
    await waitFor(() => expect(editor().query.node(id).get().data.custom?.interactions).toBeDefined());

    await userEvent.click(textNode);

    expect(play.back).toHaveBeenCalledTimes(1);
  });
});
