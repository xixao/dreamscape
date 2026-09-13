import { describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { OVERLAY_MIN_HEIGHT } from '@/lib/files/screens';
import type { Interaction } from '@/lib/interactions';
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

// --- Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
// design.md sections 3 and 4) ---
//
// A second, self-contained file: overlays of every presentation type, some
// deliberately on a different page than the screens that open them (an
// overlay anywhere in the file is a valid target). Trees are built with the
// small helpers below rather than spelled out node by node like the two
// fixtures above; same serialized shape, same "only the props a test cares
// about" rule.

type SerializedNode = {
  type: { resolvedName: string };
  isCanvas: boolean;
  props: Record<string, unknown>;
  displayName: string;
  custom: Record<string, unknown>;
  hidden: boolean;
  nodes: string[];
  linkedNodes: Record<string, string>;
  parent: string | null;
};

function node(
  type: string,
  {
    props = {},
    interaction,
    nodes = [],
    parent = 'ROOT',
    isCanvas = false,
  }: {
    props?: Record<string, unknown>;
    interaction?: Interaction;
    nodes?: string[];
    parent?: string | null;
    isCanvas?: boolean;
  } = {},
): SerializedNode {
  return {
    type: { resolvedName: type },
    isCanvas,
    props,
    displayName: type,
    custom: interaction ? { interactions: [interaction] } : {},
    hidden: false,
    nodes,
    linkedNodes: {},
    parent,
  };
}

function tree(children: Record<string, SerializedNode>, rootProps: Record<string, unknown> = {}) {
  return {
    ROOT: node('LayoutBox', { props: rootProps, nodes: Object.keys(children), parent: null, isCanvas: true }),
    ...children,
  };
}

const openOverlay = (targetScreenId: string): Interaction => ({
  id: `open-${targetScreenId}`,
  trigger: 'click',
  action: 'openOverlay',
  targetScreenId,
});
const navigate = (targetScreenId: string): Interaction => ({
  id: `nav-${targetScreenId}`,
  trigger: 'click',
  action: 'navigate',
  targetScreenId,
});
const CLOSE_OVERLAY: Interaction = { id: 'close', trigger: 'click', action: 'closeOverlay' };
const BACK: Interaction = { id: 'back', trigger: 'click', action: 'back' };

const button = (label: string, interaction?: Interaction) => node('Button', { props: { label }, interaction });
const text = (content: string) => node('Text', { props: { text: content } });

const LOGIN_TREE = tree({
  openConfirm: button('Open confirm', openOverlay('dialogOverlay')),
  openFilters: button('Open filters', openOverlay('sheetOverlay')),
  openBottom: button('Open bottom sheet', openOverlay('bottomSheetOverlay')),
  showToast: button('Show toast', openOverlay('toastOverlay')),
  showNotice: button('Show notice', openOverlay('noticeOverlay')),
  openLocked: button('Open locked', openOverlay('lockedOverlay')),
  openMissing: button('Open missing overlay', openOverlay('no-such-overlay')),
  openScreenAsOverlay: button('Open second as overlay', openOverlay('screen2')),
  closeNothing: button('Close nothing', CLOSE_OVERLAY),
  goSecond: button('Go to second screen', navigate('screen2')),
});

const SECOND_TREE = tree({
  greeting: text('Hello world'),
  openFilters: button('Open filters', openOverlay('sheetOverlay')),
  goBack: button('Go back', BACK),
});

// Column on mobile, row on desktop: at the dialog's own 512 px the mobile
// breakpoint applies, at the screen's 1440 px it would not - which is how a
// test can tell whose StageProvider the overlay's blocks are reading.
const DIALOG_TREE = tree(
  {
    question: text('Are you sure?'),
    cancel: button('Cancel', CLOSE_OVERLAY),
    openFiltersFromDialog: button('Open filters from dialog', openOverlay('sheetOverlay')),
    confirmAndGo: button('Confirm and go', navigate('screen2')),
    openConfirmAgain: button('Open confirm again', openOverlay('dialogOverlay')),
  },
  { direction: { mobile: 'column', desktop: 'row' } },
);

const SHEET_TREE = tree({
  filterText: text('Filter options'),
  showToastFromSheet: button('Show toast from sheet', openOverlay('toastOverlay')),
  backFromSheet: button('Back from sheet', BACK),
});

const BOTTOM_SHEET_TREE = tree({ bottomText: text('Bottom sheet content') });
const TOAST_TREE = tree({ savedText: text('Changes saved') });
const NOTICE_TREE = tree({ noticeText: text('Notice content') });
const LOCKED_TREE = tree({
  lockedText: text('You must choose'),
  dismissLocked: button('Dismiss locked', CLOSE_OVERLAY),
});

function overlayScreens(): Screen[] {
  return [
    { id: 'screen1', name: 'Login', layout: JSON.stringify(LOGIN_TREE), stageWidth: 1440, pageId: 'page1' },
    {
      id: 'dialogOverlay',
      name: 'Confirm delete',
      layout: JSON.stringify(DIALOG_TREE),
      stageWidth: 512,
      kind: 'overlay',
      presentation: { type: 'dialog', dismissible: true },
      pageId: 'page1',
    },
    { id: 'screen2', name: 'Second screen', layout: JSON.stringify(SECOND_TREE), stageWidth: 1440, pageId: 'page1' },
    {
      id: 'sheetOverlay',
      name: 'Filters',
      layout: JSON.stringify(SHEET_TREE),
      stageWidth: 400,
      kind: 'overlay',
      presentation: { type: 'sheet', side: 'left', dismissible: true },
      pageId: 'page2',
    },
    {
      id: 'bottomSheetOverlay',
      name: 'Options',
      layout: JSON.stringify(BOTTOM_SHEET_TREE),
      stageWidth: 400,
      kind: 'overlay',
      presentation: { type: 'sheet', side: 'bottom', dismissible: false },
      pageId: 'page2',
    },
    {
      id: 'toastOverlay',
      name: 'Saved',
      layout: JSON.stringify(TOAST_TREE),
      stageWidth: 360,
      kind: 'overlay',
      presentation: { type: 'toast', position: 'top-center' },
      pageId: 'page1',
    },
    {
      id: 'noticeOverlay',
      name: 'Notice',
      layout: JSON.stringify(NOTICE_TREE),
      stageWidth: 360,
      stageHeight: 200,
      kind: 'overlay',
      presentation: { type: 'toast', position: 'bottom-right' },
      pageId: 'page1',
    },
    {
      id: 'lockedOverlay',
      name: 'Locked',
      layout: JSON.stringify(LOCKED_TREE),
      stageWidth: 480,
      kind: 'overlay',
      presentation: { type: 'dialog', dismissible: false },
      pageId: 'page1',
    },
  ];
}

function makeOverlayFile(screens: Screen[] = overlayScreens()): FileRecord {
  return {
    id: 'file1',
    name: 'Overlays',
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    pages: [
      { id: 'page1', name: 'Page 1' },
      { id: 'page2', name: 'Page 2' },
    ],
    screens,
  };
}

// A pointer down outside every open overlay, the way Radix's
// DismissableLayer actually sees one. Two things make this a helper: the
// layer only starts listening a macrotask after it mounts (it defers its
// document listener with a setTimeout(0), so the pointer down that opened a
// dialog cannot also close it), and it only reacts to a real pointer
// sequence - a bare fireEvent.pointerDown(document.body) never reaches its
// outside handler under jsdom, while user-event's click does, once told to
// ignore the `pointer-events: none` a modal Radix layer puts on <body>
// (which is exactly what an outside click has to get through).
async function clickOutside() {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  await userEvent.setup({ pointerEventsCheck: 0 }).click(document.body);
}

describe('Player overlays', () => {
  async function renderOnLogin(file = makeOverlayFile(), extraProps: { initialOverlayId?: string } = {}) {
    const user = userEvent.setup();
    render(<Player file={file} initialScreenId="screen1" {...extraProps} />);
    await screen.findByText('Open confirm');
    return user;
  }

  it('opens a dialog overlay as a sibling of the screen, with its own layout at the overlay width', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open confirm' }));

    const dialog = await screen.findByRole('dialog', { name: 'Confirm delete' });
    expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument();
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content');
    expect(dialog).toHaveStyle({ width: '512px' });
    expect(dialog).toHaveClass('p-0');
    expect(dialog).toHaveClass('max-w-[calc(100vw-2rem)]');
    expect(dialog).not.toHaveClass('sm:max-w-sm');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    // A sibling of the screen's Editor, never inside its artboard.
    expect(screen.getByTestId('artboard')).not.toContainElement(dialog);
    // The screen underneath stays mounted.
    expect(screen.getByText('Go to second screen')).toBeInTheDocument();
  });

  it('sizes the blocks inside an overlay by the overlay width, not the screen width', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open confirm' }));

    const dialog = await screen.findByRole('dialog', { name: 'Confirm delete' });
    const root = dialog.querySelector('[data-block="LayoutBox"]');
    expect(root).not.toBeNull();
    expect(root).toHaveClass('flex-col');
    expect(root).not.toHaveClass('flex-row');
  });

  it('hugs content with the overlay minimum height when the overlay has no stageHeight', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open confirm' }));
    await screen.findByRole('dialog', { name: 'Confirm delete' });

    const artboard = screen.getByTestId('overlay-artboard-dialogOverlay');
    expect(artboard).toHaveStyle({ minHeight: `${OVERLAY_MIN_HEIGHT}px` });
    expect(artboard.style.height).toBe('');
    expect(artboard).not.toHaveClass('overflow-auto');
  });

  it('takes an exact height with inner scrolling when the overlay has a stageHeight', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Show notice' }));
    await screen.findByRole('status', { name: 'Notice' });

    const artboard = screen.getByTestId('overlay-artboard-noticeOverlay');
    expect(artboard).toHaveStyle({ height: '200px' });
    expect(artboard.style.minHeight).toBe('');
    expect(artboard).toHaveClass('overflow-auto');
  });

  it('closes a dialog overlay from its own close button', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open confirm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm delete' });

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Open confirm' })).toBeInTheDocument();
  });

  it('closes the overlay that a Close overlay interaction fires from', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open confirm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm delete' });

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes a dismissible dialog on a pointer down outside it', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open confirm' }));
    await screen.findByRole('dialog', { name: 'Confirm delete' });

    await clickOutside();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('treats opening an overlay that is already in the stack as a no-op', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open confirm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm delete' });

    await user.click(within(dialog).getByRole('button', { name: 'Open confirm again' }));

    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1);
    expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument();
  });

  it('ignores openOverlay when the target is a plain screen or does not exist', async () => {
    const user = await renderOnLogin();

    await user.click(screen.getByRole('button', { name: 'Open second as overlay' }));
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(screen.queryByText('Hello world')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Open missing overlay' }));
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open confirm' })).toBeInTheDocument();
  });

  it('ignores closeOverlay when no overlay is open', async () => {
    const user = await renderOnLogin();

    await user.click(screen.getByRole('button', { name: 'Close nothing' }));

    expect(screen.getByRole('button', { name: 'Open confirm' })).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });

  it('navigate closes every open overlay before switching screens', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open confirm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm delete' });

    await user.click(within(dialog).getByRole('button', { name: 'Confirm and go' }));

    expect(await screen.findByText('Hello world')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/f/file1#s=screen2');
  });

  it('navigate closes an open toast too', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Show toast' }));
    await screen.findByRole('status', { name: 'Saved' });

    await user.click(screen.getByRole('button', { name: 'Go to second screen' }));

    expect(await screen.findByText('Hello world')).toBeInTheDocument();
    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
  });

  it('back closes the top overlay first and only then navigates back in history', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Go to second screen' }));
    await screen.findByText('Hello world');
    await user.click(screen.getByRole('button', { name: 'Open filters' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(sheet).getByText('Filter options')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Back from sheet' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull());
    expect(screen.getByText('Hello world')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect(await screen.findByRole('button', { name: 'Open confirm' })).toBeInTheDocument();
    expect(screen.queryByText('Hello world')).toBeNull();
  });

  it('renders a left sheet overlay on its side at the overlay width, with p-0 and a close button', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open filters' }));

    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(sheet).toHaveAttribute('data-slot', 'sheet-content');
    expect(sheet).toHaveAttribute('data-side', 'left');
    expect(sheet).toHaveStyle({ width: '400px' });
    expect(sheet).toHaveClass('p-0');
    expect(within(sheet).getByText('Filter options')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByTestId('artboard')).not.toContainElement(sheet);
  });

  it('renders a non-dismissible bottom sheet spanning the viewport, with no close button, ignoring Escape and outside pointer downs', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open bottom sheet' }));

    const sheet = await screen.findByRole('dialog', { name: 'Options' });
    expect(sheet).toHaveAttribute('data-side', 'bottom');
    expect(sheet.style.width).toBe('');
    expect(within(sheet).queryByRole('button', { name: 'Close' })).toBeNull();

    await user.keyboard('{Escape}');
    await clickOutside();

    expect(screen.getByRole('dialog', { name: 'Options' })).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('renders a toast overlay as a fixed card at its position with no backdrop, closable from its corner button', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Show toast' }));

    const toast = await screen.findByRole('status', { name: 'Saved' });
    expect(within(toast).getByText('Changes saved')).toBeInTheDocument();
    expect(toast).toHaveClass('fixed', 'z-[60]', 'top-4', 'left-1/2', 'border', 'rounded-lg', 'bg-background');
    expect(toast).toHaveStyle({ width: '360px' });
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeNull();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    // No modal layer: the screen underneath is still reachable.
    expect(screen.getByRole('button', { name: 'Open confirm' })).toBeInTheDocument();

    await user.click(within(toast).getByRole('button', { name: 'Close overlay' }));

    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
  });

  it('positions a bottom-right toast at the bottom right', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Show notice' }));

    const toast = await screen.findByRole('status', { name: 'Notice' });
    expect(toast).toHaveClass('bottom-4', 'right-4');
    expect(toast).not.toHaveClass('top-4');
  });

  it('a non-dismissible dialog hides its close button and ignores Escape and outside pointer downs, closing only through its own interaction', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open locked' }));
    const dialog = await screen.findByRole('dialog', { name: 'Locked' });
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Locked' })).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();

    await clickOutside();
    expect(screen.getByRole('dialog', { name: 'Locked' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Dismiss locked' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull());
    vi.unstubAllGlobals();
  });

  it('Escape closes the top dismissible overlay, and exits Play only once the stack is empty', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open confirm' }));
    await screen.findByRole('dialog', { name: 'Confirm delete' });

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull());
    expect(assign).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(assign).toHaveBeenCalledWith('/f/file1#s=screen1');
    vi.unstubAllGlobals();
  });

  it('stacks overlays in order and Escape pops only the top one', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open confirm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm delete' });
    await user.click(within(dialog).getByRole('button', { name: 'Open filters from dialog' }));
    await screen.findByRole('dialog', { name: 'Filters' });

    const [first, second] = screen.getAllByRole('dialog', { hidden: true });
    expect(first).toHaveAttribute('data-slot', 'dialog-content');
    expect(second).toHaveAttribute('data-slot', 'sheet-content');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1));
    expect(screen.getByRole('dialog', { name: 'Confirm delete' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Are you sure?')).toBeInTheDocument();
  });

  it('a toast opened above a sheet is the top of the stack: Escape closes it first, then the sheet', async () => {
    const user = await renderOnLogin();
    await user.click(screen.getByRole('button', { name: 'Open filters' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    await user.click(within(sheet).getByRole('button', { name: 'Show toast from sheet' }));
    await screen.findByRole('status', { name: 'Saved', hidden: true });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('status', { hidden: true })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull());
  });

  it('seeds the stack from initialOverlayId when it names an overlay screen', async () => {
    await renderOnLogin(makeOverlayFile(), { initialOverlayId: 'dialogOverlay' });

    const dialog = await screen.findByRole('dialog', { name: 'Confirm delete' });
    expect(within(dialog).getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('Go to second screen')).toBeInTheDocument();
    // The modal dialog aria-hides everything else, the Play chip included.
    expect(screen.getByRole('link', { hidden: true })).toHaveAttribute('href', '/f/file1#s=screen1');
  });

  it('ignores an initialOverlayId that names a plain screen or nothing at all', async () => {
    await renderOnLogin(makeOverlayFile(), { initialOverlayId: 'screen2' });
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(screen.queryByText('Hello world')).toBeNull();
    cleanupRender();

    await renderOnLogin(makeOverlayFile(), { initialOverlayId: 'no-such-overlay' });
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
  });

  it('never starts Play on an overlay frame: the first-screen fallback and an overlay initialScreenId both land on a screen', async () => {
    const [login, dialogOverlay, ...rest] = overlayScreens();
    // The overlay listed first, so plain "first in array order" would pick it.
    render(<Player file={makeOverlayFile([dialogOverlay, login, ...rest])} />);
    expect(await screen.findByRole('button', { name: 'Open confirm' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(screen.getByText('Login')).toBeInTheDocument();
    cleanupRender();

    render(<Player file={makeOverlayFile()} initialScreenId="dialogOverlay" />);
    expect(await screen.findByRole('button', { name: 'Open confirm' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });
});

// Unmounts everything the current test has rendered so far, for the few
// tests above that render the Player twice with different props (the
// global afterEach cleanup in vitest.setup.ts only runs between tests).
function cleanupRender() {
  cleanup();
}
