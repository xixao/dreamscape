import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Editor, Element, Frame, ROOT_NODE, useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { Button } from '@/components/blocks/button';
import { LayoutBox } from '@/components/blocks/layout-box';
import { resolver } from '@/components/blocks/registry';
import type { Screen } from '@/lib/files/repository';
import { CanvasFrame } from './canvas-frame';
import { PrototypeProvider, usePrototypeContext } from './prototype-context';
import { StageProvider } from './stage-context';
import { NodeIndicator, SelectionOutline } from './node-indicator';

type EditorHandle = { actions: ReturnType<typeof useEditor>['actions']; query: ReturnType<typeof useEditor>['query'] };

describe('SelectionOutline', () => {
  it('keeps the label inside the frame near its top edge, including after scrolling', () => {
    const rect = { top: 8, left: 8, width: 300, height: 200 };
    const { rerender } = render(<SelectionOutline rect={rect} color="var(--acc)" label="Card" weight="selected" />);
    expect(screen.getByText('Card')).not.toHaveClass('-translate-y-full');
    rerender(<SelectionOutline rect={{ ...rect, top: -12 }} color="var(--acc)" label="Card" weight="selected" />);
    expect(screen.getByText('Card')).toHaveStyle({ top: '12px' });
    rerender(<SelectionOutline rect={{ ...rect, top: 40 }} color="var(--acc)" label="Card" weight="selected" />);
    expect(screen.getByText('Card')).toHaveClass('-translate-y-full');
  });
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

  it('draws a selected outline for a block', async () => {
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

  it('draws the root frame outline when the root is selected', async () => {
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
    expect(await screen.findByTestId('selection-outline')).toHaveAttribute('data-weight', 'selected');
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

  it('portals into the canvas document, not the parent one, when a CanvasFrame provides it', async () => {
    render(
      <Editor resolver={resolver} onRender={NodeIndicator}>
        <StageProvider>
          <CanvasFrame width={800} height={null} zoom={1}>
            <Frame>
              <Element is={LayoutBox} canvas>
                <Button label="Pick me" />
              </Element>
            </Frame>
            <Selector pick="first-child" />
          </CanvasFrame>
        </StageProvider>
      </Editor>,
    );
    const iframe = (await screen.findByTestId('canvas-frame')) as HTMLIFrameElement;
    await waitFor(() => expect(iframe.contentDocument?.body.querySelector('button')).not.toBeNull());

    // Not in the parent document at all...
    expect(screen.queryByTestId('selection-outline')).toBeNull();
    // ...but present inside the iframe's own body.
    await waitFor(() =>
      expect(iframe.contentDocument?.body.querySelector('[data-testid="selection-outline"]')).not.toBeNull(),
    );
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
    top = 80;
    act(() => handle!.actions.setProp(ROOT_NODE, props => { props.paddingPx = 48; }));
    await waitFor(() => expect(outline).toHaveStyle({ top: '80px' }));
  });
});

describe('NodeIndicator prototype connector', () => {
  const SCREENS: Screen[] = [
    { id: 's1', name: 'Login', layout: '{}', stageWidth: 1440 },
    { id: 's2', name: 'Hello world', layout: '{}', stageWidth: 1440 },
  ];

  function Probe({ onReady }: { onReady: (handle: EditorHandle) => void }) {
    const { actions, query } = useEditor();
    useEffect(() => {
      onReady({ actions, query });
    });
    return null;
  }

  // Flips the provider's own "Show all connections in this frame" switch,
  // the same thing the Prototype panel's checkbox does.
  function ShowAll() {
    const { setShowAllConnections } = usePrototypeContext();
    useEffect(() => {
      setShowAllConnections?.(true);
    }, [setShowAllConnections]);
    return null;
  }

  function mount(panelMode: 'design' | 'prototype', showAll = false) {
    let handle: EditorHandle | null = null;
    const utils = render(
      <PrototypeProvider value={{ panelMode, screens: SCREENS }}>
        {showAll && <ShowAll />}
        <Editor resolver={resolver} onRender={NodeIndicator}>
          <StageProvider>
            <Frame>
              <Element is={LayoutBox} canvas>
                <Button label="Sign in" />
              </Element>
            </Frame>
            <Probe onReady={(h) => (handle = h)} />
          </StageProvider>
        </Editor>
      </PrototypeProvider>,
    );
    const editor = (): EditorHandle => {
      if (!handle) throw new Error('editor not mounted');
      return handle;
    };
    return { ...utils, editor };
  }

  // The connector finds its destination frame through the canvas's own
  // `data-frame-id` wrappers (canvas.tsx); a bare one stands in for it here.
  function targetFrame(id: string): () => void {
    const target = document.createElement('div');
    target.dataset.frameId = id;
    document.body.append(target);
    return () => target.remove();
  }

  async function wireNavigateToHelloWorld(editor: () => EditorHandle): Promise<string> {
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    act(() => {
      editor().actions.setCustom(buttonId, (custom: Record<string, unknown>) => {
        custom.interactions = [{ id: 'i1', trigger: 'click', action: 'navigate', targetScreenId: 's2' }];
      });
    });
    await waitFor(() =>
      expect(editor().query.node(buttonId).get().data.custom?.interactions).toBeDefined(),
    );
    return buttonId;
  }

  async function selectNode(editor: () => EditorHandle, id: string): Promise<void> {
    act(() => editor().actions.selectNode(id));
    await waitFor(() => expect(editor().query.getEvent('selected').contains(id)).toBe(true));
  }

  it('draws the connection to the target frame once the wired node is selected, with the outline', async () => {
    const removeTarget = targetFrame('s2');
    try {
      const { editor } = mount('prototype');
      await screen.findByRole('button', { name: 'Sign in' });
      const buttonId = await wireNavigateToHelloWorld(editor);
      expect(screen.queryByLabelText('Prototype connection')).toBeNull();

      await selectNode(editor, buttonId);

      expect(await screen.findByRole('button', { name: 'Edit connection to Hello world' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hello world' })).toBeInTheDocument();
      expect(await screen.findByTestId('selection-outline')).toHaveAttribute('data-weight', 'selected');
    } finally {
      removeTarget();
    }
  });

  it('draws nothing in design mode even for a selected, wired node', async () => {
    const removeTarget = targetFrame('s2');
    try {
      const { editor } = mount('design');
      await screen.findByRole('button', { name: 'Sign in' });
      const buttonId = await wireNavigateToHelloWorld(editor);
      await selectNode(editor, buttonId);

      expect(await screen.findByTestId('selection-outline')).toBeInTheDocument();
      expect(screen.queryByLabelText('Prototype connection')).toBeNull();
    } finally {
      removeTarget();
    }
  });

  it('shows every wired connection in the frame, unselected, when Show all connections is on', async () => {
    const removeTarget = targetFrame('s2');
    try {
      const { editor } = mount('prototype', true);
      await screen.findByRole('button', { name: 'Sign in' });
      await wireNavigateToHelloWorld(editor);

      expect(await screen.findByRole('button', { name: 'Edit connection to Hello world' })).toBeInTheDocument();
      // Only a selected node gets the drag handle.
      expect(screen.queryByRole('button', { name: 'Hello world' })).toBeNull();
    } finally {
      removeTarget();
    }
  });

  it('drops the connection once the interaction is cleared, leaving the handle to drag a new one', async () => {
    const removeTarget = targetFrame('s2');
    try {
      const { editor } = mount('prototype');
      await screen.findByRole('button', { name: 'Sign in' });
      const buttonId = await wireNavigateToHelloWorld(editor);
      await selectNode(editor, buttonId);
      await screen.findByRole('button', { name: 'Edit connection to Hello world' });

      act(() => {
        editor().actions.setCustom(buttonId, (custom: Record<string, unknown>) => {
          delete custom.interactions;
        });
      });

      await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit connection to Hello world' })).toBeNull());
      expect(screen.getByRole('button', { name: 'Drag to connect' })).toBeInTheDocument();
    } finally {
      removeTarget();
    }
  });
});
