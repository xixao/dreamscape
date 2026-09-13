import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { Player } from './player';

// Hand-built Craft serialized trees (the JSON string shape `Screen.layout`
// and the repository always use - see lib/files/validate.ts's Screen type).
// Every node omits any prop that matches its block's own craft.props
// default: Craft's deserializer merges those in for any key a node's saved
// props does not have (confirmed in components/blocks/layout-box.tsx's own
// comment on this exact mechanism), so only the props each test cares about
// need to be spelled out.
const SCREEN_1_TREE = {
  ROOT: {
    type: { resolvedName: 'LayoutBox' },
    isCanvas: true,
    props: {},
    displayName: 'LayoutBox',
    custom: {},
    hidden: false,
    nodes: ['navButton', 'dialogButton', 'dialog1', 'emailInput'],
    linkedNodes: {},
    parent: null,
  },
  navButton: {
    type: { resolvedName: 'Button' },
    isCanvas: false,
    props: { label: 'Go to second screen' },
    displayName: 'Button',
    custom: { interactions: [{ id: 'i1', trigger: 'click', action: 'navigate', targetScreenId: 'screen2' }] },
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
  dialogButton: {
    type: { resolvedName: 'Button' },
    isCanvas: false,
    props: { label: 'Open confirm' },
    displayName: 'Button',
    custom: { interactions: [{ id: 'i2', trigger: 'click', action: 'openDialog', targetNodeId: 'dialog1' }] },
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
  dialog1: {
    type: { resolvedName: 'Dialog' },
    isCanvas: false,
    props: { title: 'Confirm action', triggerLabel: 'Confirm', previewOpen: false },
    displayName: 'Dialog',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: { content: 'dialog1Content' },
    parent: 'ROOT',
  },
  dialog1Content: {
    type: { resolvedName: 'DialogContent' },
    isCanvas: true,
    props: {},
    displayName: 'DialogContent',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'dialog1',
  },
  emailInput: {
    type: { resolvedName: 'Input' },
    isCanvas: false,
    props: { placeholder: 'you@example.com' },
    displayName: 'Input',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
};

const SCREEN_2_TREE = {
  ROOT: {
    type: { resolvedName: 'LayoutBox' },
    isCanvas: true,
    props: {},
    displayName: 'LayoutBox',
    custom: {},
    hidden: false,
    nodes: ['greeting', 'backButton', 'missingNavButton'],
    linkedNodes: {},
    parent: null,
  },
  greeting: {
    type: { resolvedName: 'Text' },
    isCanvas: false,
    props: { text: 'Hello world' },
    displayName: 'Text',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
  backButton: {
    type: { resolvedName: 'Button' },
    isCanvas: false,
    props: { label: 'Go back' },
    displayName: 'Button',
    custom: { interactions: [{ id: 'i3', trigger: 'click', action: 'back' }] },
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
  // Wired to a screen id this file does not have - simulates a navigate
  // interaction whose target screen was deleted in the editor after the
  // interaction was set up.
  missingNavButton: {
    type: { resolvedName: 'Button' },
    isCanvas: false,
    props: { label: 'Go to missing screen' },
    displayName: 'Button',
    custom: { interactions: [{ id: 'i4', trigger: 'click', action: 'navigate', targetScreenId: 'no-such-screen' }] },
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
};

function makeFile({ screen1StageHeight }: { screen1StageHeight?: number } = {}): FileRecord {
  const screens: Screen[] = [
    {
      id: 'screen1',
      name: 'Login',
      layout: JSON.stringify(SCREEN_1_TREE),
      stageWidth: 1440,
      stageHeight: screen1StageHeight,
    },
    { id: 'screen2', name: 'Second screen', layout: JSON.stringify(SCREEN_2_TREE), stageWidth: 1440 },
  ];
  return {
    id: 'file1',
    name: 'Sign-in flow',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    screens,
  };
}

describe('Player', () => {
  it('navigates to screen 2 when the wired button is clicked', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    expect(await screen.findByRole('button', { name: 'Go to second screen' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to second screen' }));

    expect(await screen.findByText('Hello world')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to second screen' })).toBeNull();
  });

  it('returns to screen 1 when Back is clicked', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await user.click(await screen.findByRole('button', { name: 'Go to second screen' }));
    await user.click(await screen.findByRole('button', { name: 'Go back' }));

    expect(await screen.findByRole('button', { name: 'Go to second screen' })).toBeInTheDocument();
    expect(screen.queryByText('Hello world')).toBeNull();
  });

  it('opens the real dialog with its title when the openDialog interaction fires', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await user.click(await screen.findByRole('button', { name: 'Open confirm' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Confirm action')).toBeInTheDocument();
  });

  it('lets an input be typed into', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    const input = await screen.findByPlaceholderText('you@example.com');

    await user.type(input, 'matt@example.com');

    expect(input).toHaveValue('matt@example.com');
  });

  it('never renders a selection outline', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await screen.findByRole('button', { name: 'Go to second screen' });
    expect(screen.queryByTestId('selection-outline')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Open confirm' }));
    await screen.findByRole('dialog');
    expect(screen.queryByTestId('selection-outline')).toBeNull();
  });

  it('ignores a page diagram entirely (spec: "Play mode ignores diagrams")', async () => {
    const file = makeFile();
    file.pages = [
      {
        id: 'page1',
        name: 'Page 1',
        diagram: {
          nodes: [
            { id: 'node1', kind: 'rect', x: 0, y: 0, width: 120, height: 60, text: 'Decision', color: 'blue' },
          ],
          edges: [],
        },
      },
    ];
    render(<Player file={file} initialScreenId="screen1" />);

    expect(await screen.findByRole('button', { name: 'Go to second screen' })).toBeInTheDocument();
    expect(screen.queryByTestId('diagram-layer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('diagram-node-node1')).not.toBeInTheDocument();
    expect(screen.queryByText('Decision')).not.toBeInTheDocument();
  });

  it('paints the artboard text in the basic theme foreground, not the chrome text colour', async () => {
    const { container } = render(<Player file={makeFile()} initialScreenId="screen1" />);
    await screen.findByRole('button', { name: 'Go to second screen' });

    // The SF2 chrome sets a light body text colour; the white artboard must
    // reset it or every Text block in Play reads as faint gray on white.
    const artboard = container.querySelector('.theme-basic');
    expect(artboard).not.toBeNull();
    expect(artboard).toHaveClass('bg-background');
    expect(artboard).toHaveClass('text-foreground');
  });

  it('sizes the artboard with minHeight, not a fixed height, when the screen has no manual stageHeight', async () => {
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await screen.findByRole('button', { name: 'Go to second screen' });

    const artboard = screen.getByTestId('artboard');
    expect(artboard).toHaveStyle({ minHeight: `${ARTBOARD_MIN_HEIGHT}px` });
    expect(artboard.style.height).toBe('');
    expect(artboard).not.toHaveClass('overflow-auto');
  });

  it('sizes the artboard with an exact height and inner scrolling when the screen has a manual stageHeight', async () => {
    render(<Player file={makeFile({ screen1StageHeight: 700 })} initialScreenId="screen1" />);
    await screen.findByRole('button', { name: 'Go to second screen' });

    const artboard = screen.getByTestId('artboard');
    expect(artboard).toHaveStyle({ height: '700px' });
    expect(artboard.style.minHeight).toBe('');
    expect(artboard).toHaveClass('overflow-auto');
  });

  it('shows the screen name and a close link back to the editor in the overlay', async () => {
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await screen.findByRole('button', { name: 'Go to second screen' });

    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Esc to exit')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/f/file1#s=screen1');
  });

  it('updates the close link target after navigating to another screen', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await user.click(await screen.findByRole('button', { name: 'Go to second screen' }));
    await screen.findByText('Hello world');

    expect(screen.getByText('Second screen')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/f/file1#s=screen2');
  });

  it('calls window.location.assign with the editor link when Escape is pressed', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await screen.findByRole('button', { name: 'Go to second screen' });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(assign).toHaveBeenCalledWith('/f/file1#s=screen1');
    vi.unstubAllGlobals();
  });

  it('closes an open dialog on the first Escape and exits Play only on the second', async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await user.click(await screen.findByRole('button', { name: 'Open confirm' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.keyboard('{Escape}');
    expect(assign).toHaveBeenCalledWith('/f/file1#s=screen1');

    vi.unstubAllGlobals();
  });

  it('ignores a navigate interaction whose target screen no longer exists', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen2" />);
    await screen.findByText('Hello world');

    await user.click(screen.getByRole('button', { name: 'Go to missing screen' }));

    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Second screen')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/f/file1#s=screen2');
  });

  it('falls back to the first screen when initialScreenId names no screen of this file', async () => {
    render(<Player file={makeFile()} initialScreenId="not-a-real-screen" />);
    expect(await screen.findByRole('button', { name: 'Go to second screen' })).toBeInTheDocument();
  });

  // Pages (docs/superpowers/specs/2026-09-12-pages-design.md section 4):
  // "app/f/[id]/play/page.tsx and components/play/player.tsx resolve the
  // page and start on its first screen (or the given one)". Pages of its
  // own, distinct from makeFile() above (which predates pages, has no
  // `pages` array, and every other test in this file relies on that to
  // keep exercising the pageless fallback path).
  function makeFileWithPages(): FileRecord {
    return {
      id: 'file1',
      name: 'Sign-in flow',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      pages: [
        { id: 'page1', name: 'Page 1' },
        { id: 'page2', name: 'v2' },
      ],
      screens: [
        { id: 'screen1', name: 'Login', layout: JSON.stringify(SCREEN_1_TREE), stageWidth: 1440, pageId: 'page1' },
        {
          id: 'screen2',
          name: 'Second screen',
          layout: JSON.stringify(SCREEN_2_TREE),
          stageWidth: 1440,
          pageId: 'page2',
        },
      ],
    };
  }

  describe('pages', () => {
    it('starts on the given page\'s first screen when no screen is given', async () => {
      render(<Player file={makeFileWithPages()} initialPageId="page2" />);
      expect(await screen.findByText('Hello world')).toBeInTheDocument();
    });

    it('an explicit initialScreenId wins even when initialPageId names a different page', async () => {
      render(<Player file={makeFileWithPages()} initialScreenId="screen1" initialPageId="page2" />);
      expect(await screen.findByRole('button', { name: 'Go to second screen' })).toBeInTheDocument();
    });

    it('falls back to the first page with any screen when neither is given', async () => {
      render(<Player file={makeFileWithPages()} />);
      expect(await screen.findByRole('button', { name: 'Go to second screen' })).toBeInTheDocument();
    });

    it('falls back to the first page with any screen when the given page does not exist', async () => {
      render(<Player file={makeFileWithPages()} initialPageId="doesnotexist" />);
      expect(await screen.findByRole('button', { name: 'Go to second screen' })).toBeInTheDocument();
    });
  });
});
