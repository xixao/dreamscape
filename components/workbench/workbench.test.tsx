import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { loadViewport } from '@/lib/canvas/viewport-store';
import { EXAMPLES } from '@/lib/examples';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { createOverlayScreen } from '@/lib/files/screens';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { Workbench } from './workbench';
import loginExampleLayout from '@/lib/examples/login-screen.json';

// The stage-width ToggleGroupItem buttons are `role="radio"` (a single-select
// ToggleGroup is a radiogroup), not `role="button"`; matched by visible text
// instead, same as components/workbench/topbar.test.tsx's own presetButton().
function presetButton(label: string) {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`no button for ${label}`);
  return button;
}

// A dedicated instance with the per-interaction delay disabled, used by the
// frames-chip helpers below instead of the plain `userEvent.click` static
// API: the default (non-null) delay schedules a real `setTimeout` for each
// click, which becomes a fake, never-advanced timer once a test has called
// `vi.useFakeTimers()` (see "sends no PATCH when switching screens and back
// without an edit") - `userEvent.click` itself takes no per-call options, so
// disabling the delay means routing these helpers through a `setup()`
// instance instead. Every use below is a single, self-contained `.click()`
// (never a held key or button spanning two calls), so sharing one instance
// across tests carries none of `setup()`'s usual cross-test state risk.
const user = userEvent.setup({ delay: null });

// Select a frame from the frames chip dropdown menu by name. Opens the menu
// and clicks the frame row, which switches to it and closes the menu.
async function selectFrame(frameName: string): Promise<void> {
  const framesButton = screen.getByRole('button', { name: 'Frames' });
  await user.click(framesButton);
  const frameItem = await screen.findByRole('menuitem', { name: frameName });
  await user.click(frameItem);
}

// Add a new frame via the frames chip menu.
async function addNewFrame(): Promise<void> {
  const framesButton = screen.getByRole('button', { name: 'Frames' });
  const beforeLabel = framesButton.textContent;
  await user.click(framesButton);
  const newFrameItem = await screen.findByRole('menuitem', { name: 'New frame' });
  await user.click(newFrameItem);
  // Waits for the new screen's own state update (and Craft's first-render
  // pass for its brand new empty layout) to actually land, rather than a
  // blind sleep: the chip's own name-and-count text is the one thing every
  // caller can assert changed, regardless of how many frames existed
  // before or what the new one gets named.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Frames' }).textContent).not.toBe(beforeLabel));
}

// Opens a frame row's own per-row submenu - Rename/Duplicate/Move to
// page/Delete for THAT specific frame (spec: "each row has" these, not only
// the focused frame's own) - via the keyboard, the same "press Right"
// contract a Radix DropdownMenuSubTrigger offers alongside hover. Opens
// synchronously (unlike hover's own 100ms-delayed open), so callers don't
// need a waitFor just to reach it. Deliberately does not click the row
// itself first: that would instead just focus and zoom to it and close the
// whole menu (frames-chip.tsx's own onClick on the row), which is exactly
// the "must switch to a frame before acting on it" limitation this helper
// exists to avoid exercising.
async function openFrameRowMenu(frameName: string): Promise<void> {
  const framesButton = screen.getByRole('button', { name: 'Frames' });
  await user.click(framesButton);
  const row = await screen.findByRole('menuitem', { name: frameName });
  fireEvent.keyDown(row, { key: 'ArrowRight' });
}

// Duplicate a frame by name, via its own row submenu - see
// openFrameRowMenu's own comment on why this never selects it first.
async function duplicateFrame(frameName: string): Promise<void> {
  await openFrameRowMenu(frameName);
  const duplicateItem = await screen.findByRole('menuitem', { name: 'Duplicate' });
  await user.click(duplicateItem);
}

// Delete a frame by name, via its own row submenu - see openFrameRowMenu's
// own comment on why this never selects it first.
async function deleteFrame(frameName: string): Promise<void> {
  await openFrameRowMenu(frameName);
  const deleteItem = await screen.findByRole('menuitem', { name: 'Delete' });
  await user.click(deleteItem);
}

// selectFrame's own `user.click` hangs forever under `vi.useFakeTimers()`:
// every userEvent interaction is wrapped (via @testing-library/dom's shared
// config) in @testing-library/react's asyncWrapper, which drains React's
// act() queue by scheduling a real `setTimeout(fn, 0)` and only knows how to
// force that timer to fire for JEST's fake timers (it checks for a global
// `jest`, which a Vitest project has no equivalent of) - so under
// `vi.useFakeTimers()` nothing ever advances it and the whole interaction's
// promise never resolves, no matter the `delay`/`advanceTimers` config (this
// is a separate mechanism from user-event's own inter-event delay).
// `fireEvent` has no such wrapper - it dispatches synchronously and returns
// immediately - so it works under fake timers, but `fireEvent.click` alone
// would not open the menu: the frames chip's DropdownMenuTrigger (Radix)
// opens on `pointerdown`, not `click` (see
// @radix-ui/react-dropdown-menu's DropdownMenuTrigger), while a menu item
// selects on `click` (see @radix-ui/react-menu's MenuItem). Used instead of
// selectFrame only by the one test that needs both a menu interaction and
// deterministic control of fake time in the same test.
function selectFrameWithFakeTimers(frameName: string): void {
  const framesButton = screen.getByRole('button', { name: 'Frames' });
  fireEvent.pointerDown(framesButton, { button: 0 });
  const frameItem = screen.getByRole('menuitem', { name: frameName });
  fireEvent.click(frameItem);
}

// Move a frame to another page by frame name and page name, via its own
// row submenu - see openFrameRowMenu's own comment on why this never
// selects it first.
async function moveFrameToPage(frameName: string, pageName: string): Promise<void> {
  await openFrameRowMenu(frameName);
  // "Move to page" is itself a nested submenu trigger, one level inside the
  // frame row's own submenu; a Radix DropdownMenuSubTrigger renders as
  // role="menuitem" (aria-haspopup set on the same menuitem element), not
  // role="button".
  const moveToPageTrigger = await screen.findByRole('menuitem', { name: 'Move to page' });
  await user.click(moveToPageTrigger);
  const pageItem = await screen.findByRole('menuitem', { name: pageName });
  // fireEvent.click, not user.click: user-event's realistic pointer-move
  // simulation into a Radix submenu confuses its own hover/"grace area"
  // tracking in jsdom (there is no real layout for it to measure) and the
  // click on the page item is swallowed - onSelect never fires and the
  // whole menu tree is left open. A plain click event is all MenuItem's own
  // handler (onClick, composed with handleSelect - see
  // @radix-ui/react-menu's MenuItem) needs to select it and close the menu.
  fireEvent.click(pageItem);
}

// Craft's rendered tree now lives inside the CanvasFrame iframe (stage.tsx),
// a separate document `screen` (bound to the outer one) cannot see into.
// Synchronous, not a `findBy`-style async helper: React (via Testing
// Library's `act` wrapping of `render`/`fireEvent`) has already flushed
// CanvasFrame's own effect and portaled the frame's content into the iframe
// body by the time any of these callers run, the same guarantee the rest of
// this file already relied on for the pre-iframe artboard. Throws instead of
// silently returning an empty body so a real timing regression fails fast
// with a clear message rather than a confusing "element not found" later.
//
// The infinite canvas (canvas.tsx) mounts every screen's own CanvasFrame at
// once, so `canvas-frame` is no longer unique once a file has more than one
// screen - scoped to the one inside `[data-testid="artboard"]` (the focused,
// live-editing Stage), never a `[data-testid="artboard-preview"]` (a
// non-focused, read-only FramePreview).
function frameBody(): HTMLElement {
  const iframe = document.querySelector('[data-testid="artboard"] [data-testid="canvas-frame"]') as
    | HTMLIFrameElement
    | null;
  const body = iframe?.contentDocument?.body;
  if (!body) throw new Error('canvas frame body not ready');
  return body;
}

// Screen content for these tests comes from two different bundled examples
// (not a hand-built layout string) deliberately: every example is already
// proven to round-trip byte-for-byte through Craft's own deserialize/
// serialize (see lib/examples/index.test.tsx's "renders ... with no console
// errors" checks and the "unchanged layout on mount" tests just below,
// which depend on exactly this property for EXAMPLES[0]). A hand-built
// layout is not guaranteed to have it - Craft's deserialize normalizes a
// node's props against its component's own `craft.props` defaults, and a
// fixture assembled by hand can drift from that just enough (a few bytes)
// to make a screen's very first mount look like a real edit and trigger an
// unwanted extra save that has nothing to do with what a test is checking.
// The one page every screen in this file's fixtures lives on unless a test
// explicitly builds a second one - keeping it a fixed, known id (rather
// than leaving `pages` off FileRecord and letting Workbench's own
// resolveInitialPages fallback mint a random one) is what lets tests below
// assert on exact hash/URL/saved-patch values instead of pattern-matching a
// page id they cannot predict.
const PAGE_ID = 'page000001';
const SCREEN_1: Screen = {
  id: 'screen0001',
  name: 'Frame 1',
  layout: EXAMPLES[0].layout,
  stageWidth: EXAMPLES[0].stageWidth,
  pageId: PAGE_ID,
};
const SCREEN_2: Screen = {
  id: 'screen0002',
  name: 'Frame 2',
  layout: EXAMPLES[2].layout, // Settings: has a "Save changes" button, unlike Login.
  stageWidth: EXAMPLES[2].stageWidth,
  pageId: PAGE_ID,
};
// Used only by the "frame positions" tests below, which need a third screen
// and never assert on its rendered content.
const SCREEN_3: Screen = {
  id: 'screen0003',
  name: 'Frame 3',
  layout: EXAMPLES[1].layout,
  stageWidth: EXAMPLES[1].stageWidth,
  pageId: PAGE_ID,
};

// A second page, for the "pages" describe block further down: its own id
// and its own screen, on EXAMPLES[1] (Dashboard) so its content is visibly
// different from PAGE_ID's own screens (a "Save changes" button never
// appears on it, the way it does not on SCREEN_1's Login example either).
const PAGE_2_ID = 'page000002';
const SCREEN_4: Screen = {
  id: 'screen0004',
  name: 'Frame 1',
  layout: EXAMPLES[1].layout,
  stageWidth: EXAMPLES[1].stageWidth,
  pageId: PAGE_2_ID,
};

const BASE_FILE: FileRecord = {
  id: 'file0000ab',
  name: 'Untitled',
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
  folderId: null,
  pages: [{ id: PAGE_ID, name: 'Page 1' }],
  screens: [SCREEN_1],
};

function makeFile(overrides: Partial<FileRecord> = {}): FileRecord {
  return { ...BASE_FILE, ...overrides };
}

function ok(updatedAt: string): Response {
  return new Response(JSON.stringify({ updatedAt }), { status: 200 });
}

function conflict(updatedAt: string): Response {
  return new Response(JSON.stringify({ updatedAt }), { status: 409 });
}

// Selects the root frame by dispatching the mousedown Craft.js's connectors
// listen for directly on its DOM node (its own `data-block="LayoutBox"`
// element; the login example's only other blocks are Card/Input/Button), then
// flips its "Layout" field from Auto layout to Grid through the Design panel:
// a genuine `setProp` on ROOT driven through the rendered editor, not a bare
// harness call.
async function changeRootLayoutMode(): Promise<void> {
  const root = frameBody().querySelector('[data-block="LayoutBox"]');
  if (!root) throw new Error('root LayoutBox not found');
  fireEvent.mouseDown(root);
  const group = screen.getByRole('radiogroup', { name: 'Layout' });
  await userEvent.click(within(group).getByRole('radio', { name: 'Grid' }));
}

describe('Workbench', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // A fresh Response per call (not mockResolvedValue, which would hand
    // every call the very same Response instance): a Fetch Response body
    // can only be read once, and addScreen's flow can legitimately send
    // twice in one test (the immediate flush, plus Craft's own
    // onNodesChange first-fire for the brand new empty Frame - see the
    // comment on that pattern further down). A second .json() read of an
    // already-consumed shared Response throws, which the real saver treats
    // as a network failure and retries after a real 5 s timer - one that
    // then outlives the test and can fire during a later, unrelated one.
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok('T1')));
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '';
    // The right panel's tab and minimized state are now remembered per
    // browser (assembly-workbench:panel-mode / :panel-collapsed, like
    // chatOpen's own assembly-workbench:chat-open) - cleared so every test
    // starts from the same default (Design, expanded) regardless of what an
    // earlier test in this file persisted.
    localStorage.clear();
  });

  // Deliberately does not call vi.unstubAllGlobals(): this file's own
  // afterEach runs before the testing-library setup file's afterEach(()
  // => cleanup()) (inner-scope hooks run before outer/global ones), and
  // Workbench flushes any pending save on unmount. Unstubbing fetch here
  // would make that unmount-triggered flush hit the real (unmocked) fetch
  // instead - which fails, and the saver's own retry-after-5s logic then
  // schedules a real setTimeout that outlives this test and can fire
  // during a later, unrelated one, sending a stale patch through whatever
  // fetchMock that later test happens to be asserting against. beforeEach
  // already installs a fresh stub before every test, so nothing here
  // actually depends on unstubbing in between.
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.location.hash = '';
  });

  it('renders the layout of the file\'s first screen', () => {
    render(<Workbench file={makeFile()} />);
    expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends exactly one PATCH after the debounce when a prop changes on ROOT', async () => {
    render(<Workbench file={makeFile()} />);

    await changeRootLayoutMode();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/files/${BASE_FILE.id}`);
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(body.baseUpdatedAt).toBe(BASE_FILE.updatedAt);
    expect(body.screens).toHaveLength(1);
    expect(JSON.parse(body.screens[0].layout).ROOT.props.mode).toBe('grid');
    expect(body.screens[0].id).toBe(SCREEN_1.id);
  });

  it('shows Saving then Saved in the topbar', async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    fetchMock.mockReturnValueOnce(pending);
    render(<Workbench file={makeFile()} />);

    await userEvent.click(presetButton('Mobile'));
    await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('Saving'), {
      timeout: 1500,
    });

    resolveFetch(ok('T1'));
    await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('Saved'));
  });

  it('shows the conflict message and a Reload button after a 409 response', async () => {
    fetchMock.mockResolvedValueOnce(conflict('Tserver'));
    render(<Workbench file={makeFile()} />);

    await userEvent.click(presetButton('Mobile'));

    await waitFor(
      () => expect(screen.getByTestId('save-state')).toHaveTextContent('Someone else changed this file.'),
      { timeout: 1500 },
    );
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('PATCHes the new stage width, on the current screen, when the frame width changes', async () => {
    render(<Workbench file={makeFile()} />);

    await userEvent.click(presetButton('Mobile'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.screens[0].stageWidth).toBe(375);
    expect(body.baseUpdatedAt).toBe(BASE_FILE.updatedAt);
  });

  it('PATCHes the new name when the file name field is renamed', async () => {
    render(<Workbench file={makeFile({ name: 'Untitled' })} />);

    await userEvent.click(screen.getByRole('button', { name: 'File settings' }));
    const field = screen.getByTestId('file-name');
    await userEvent.clear(field);
    await userEvent.type(field, 'My design{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.name).toBe('My design');
  });

  it('flushes a pending save on unmount', async () => {
    const { unmount } = render(<Workbench file={makeFile()} />);

    await userEvent.click(presetButton('Mobile'));
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('flushes a pending save on pagehide', async () => {
    render(<Workbench file={makeFile()} />);

    await userEvent.click(presetButton('Mobile'));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('changes the file appearance and updates inheriting artboards', async () => {
    render(<Workbench file={makeFile()} />);
    await userEvent.click(screen.getByRole('button', { name: 'File settings' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'File appearance' }), 'dark');
    await waitFor(() => expect(frameBody()).toHaveAttribute('data-appearance', 'dark'));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => typeof init?.body === 'string' && JSON.parse(init.body).appearance === 'dark')).toBe(true));
  });

  it('undoes and redoes root-frame appearance including inheritance', async () => {
    render(<Workbench file={makeFile()} />);
    fireEvent.mouseDown(frameBody().querySelector('[data-block="LayoutBox"]')!);
    const control = await screen.findByRole('combobox', { name: 'Frame appearance' });
    await userEvent.selectOptions(control, 'internal-dark');
    await waitFor(() => expect(frameBody()).toHaveAttribute('data-appearance', 'internal-dark'));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(control).toHaveValue('inherit'));
    expect(frameBody()).toHaveAttribute('data-appearance', 'light');
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(control).toHaveValue('internal-dark'));
  });

  it('undoes a layout grid toggle and restores it on redo', async () => {
    render(<Workbench file={makeFile()} />);
    fireEvent.keyDown(window, { key: 'G', shiftKey: true });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    const reverted = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
    expect(reverted.screens[0].layoutGrid?.visible ?? false).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).screens[0].layoutGrid.visible).toBe(true);
  });

  it('omits the destructive New frame action from the top bar', () => {
    render(<Workbench file={makeFile()} />);
    expect(screen.queryByRole('button', { name: 'New frame' })).not.toBeInTheDocument();
    expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  describe('unchanged layout on mount', () => {
    function selectRoot(): void {
      const root = frameBody().querySelector('[data-block="LayoutBox"]');
      if (!root) throw new Error('root LayoutBox not found');
      fireEvent.mouseDown(root);
    }

    it('sends no PATCH within 2s of fake time, even once the root gets selected with no real edit', async () => {
      vi.useFakeTimers();
      render(<Workbench file={makeFile()} />);

      // Craft's onNodesChange fires unconditionally the first time its store
      // notifies after mount (it has nothing yet to compare that firing's
      // content against), and a plain selection - not a prop change - is
      // enough to trigger that first notification. That first firing's
      // content matches what's already stored, so it must not be queued.
      selectRoot();

      await vi.advanceTimersByTimeAsync(2000);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends no PATCH on opening a file whose stored layout lacks the defaults Craft adds (an example file)', async () => {
      vi.useFakeTimers();
      const exampleLayout = JSON.stringify(loginExampleLayout);
      render(<Workbench file={makeFile({ screens: [{ ...SCREEN_1, layout: exampleLayout }] })} />);
      selectRoot();

      await vi.advanceTimersByTimeAsync(2000);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends no PATCH when switching screens and back without an edit', async () => {
      vi.useFakeTimers();
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      await vi.advanceTimersByTimeAsync(1000);

      // selectFrame (userEvent-based) deadlocks under fake timers - see
      // selectFrameWithFakeTimers' own comment.
      selectFrameWithFakeTimers('Frame 2');
      await vi.advanceTimersByTimeAsync(1500);
      selectFrameWithFakeTimers('Frame 1');
      await vi.advanceTimersByTimeAsync(2000);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still sends exactly one PATCH for a real edit made after that unchanged first firing', async () => {
      render(<Workbench file={makeFile()} />);
      selectRoot();

      // Let the (correctly suppressed) first firing's would-be debounce
      // window fully elapse before making a real edit, so the assertions
      // below can't pass by accident from the two patches merging together
      // before either is ever sent.
      await new Promise((resolve) => setTimeout(resolve, 900));
      expect(fetchMock).not.toHaveBeenCalled();

      await changeRootLayoutMode();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(JSON.parse(body.screens[0].layout).ROOT.props.mode).toBe('grid');
    });

    it('does not send another PATCH when the same change is applied again with no diff', async () => {
      render(<Workbench file={makeFile()} />);

      await changeRootLayoutMode();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

      // Re-applying the same value: a single-select ToggleGroup treats a
      // click on the already-active item as a deselect, which the Field
      // wrapper ignores (no option matches an empty value), so this reaches
      // Craft as a no-op - if it produced a layout at all, it would be
      // identical to what was just saved, and lastSavedLayout must not let
      // a duplicate through either way.
      await changeRootLayoutMode();
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Show/Hide UI', () => {
    it('Cmd+\\ hides the right panel, the top bar and the frames chip, keeping the canvas; Cmd+\\ again restores them', () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('complementary', { name: 'Design' })).toBeInTheDocument();
      expect(screen.getByTestId('save-state')).toBeInTheDocument();
      expect(screen.getByTestId('artboard')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Frames' })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });

      expect(screen.queryByRole('complementary', { name: 'Design' })).toBeNull();
      expect(screen.queryByTestId('save-state')).toBeNull();
      // The frames chip hides too now (spec docs/superpowers/specs/
      // 2026-09-13-frames-chip-design.md: "hidden with Cmd+\ like the rest of the chrome")
      expect(screen.queryByRole('button', { name: 'Frames' })).toBeNull();
      expect(screen.getByTestId('artboard')).toBeInTheDocument();
      expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });

      expect(screen.getByRole('complementary', { name: 'Design' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Frames' })).toBeInTheDocument();
      expect(screen.getByTestId('artboard')).toBeInTheDocument();
    });
  });

  describe('screens', () => {
    it('renders a chip for each screen, the first active by default', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      const framesButton = screen.getByRole('button', { name: 'Frames' });
      // The chip shows: "Frame 1 · 2" (name · count)
      expect(framesButton).toHaveTextContent('Frame 1 · 2');
      await userEvent.click(framesButton);
      const items = screen.getAllByRole('menuitem');
      // First two menuitems are the frames (Frame 1, Frame 2)
      expect(items[0]).toHaveTextContent('Frame 1');
      expect(items[1]).toHaveTextContent('Frame 2');
      // Frame 1 should have a check mark (focused)
      expect(within(items[0]).getByTestId('frame-check')).toBeInTheDocument();
    });

    it('switching screens swaps the artboard content', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      await selectFrame('Frame 2');

      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(within(frameBody()).queryByRole('button', { name: 'Sign in' })).toBeNull();
      // Verify the frames chip shows Frame 2 as focused
      expect(screen.getByRole('button', { name: 'Frames' })).toHaveTextContent('Frame 2');
    });

    it('New screen adds a screen sized like the current one and switches to it', async () => {
      render(<Workbench file={makeFile()} />);

      await addNewFrame();

      // The frames chip should now show "Frame 2 · 2" (name · count)
      const framesButton = await screen.findByRole('button', { name: 'Frames' });
      expect(framesButton).toHaveTextContent('Frame 2 · 2');
      expect(await within(frameBody()).findByText('This frame is empty')).toBeInTheDocument();

      // Drains this screen's own save traffic before the test ends: Craft's
      // own onNodesChange first-fire for the brand new empty Frame is not a
      // no-op here (deserializing then reserializing a fresh
      // emptyLayoutJson() is not byte-identical to the string it started
      // from, so it looks like a real edit and queues one more, harmless
      // save on top of the one addScreen already queued). Undrained, that
      // second save's async tail can complete during a LATER test instead
      // of this one and call that test's own fetchMock - the same class of
      // problem this file's own afterEach comment documents for the retry
      // timer.
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('Shift+N adds a screen and switches to it, same as the New screen button', async () => {
      render(<Workbench file={makeFile()} />);

      fireEvent.keyDown(window, { key: 'n', shiftKey: true });

      // The frames chip should now show "Frame 2 · 2"
      const framesButton = screen.getByRole('button', { name: 'Frames' });
      await waitFor(() => expect(framesButton).toHaveTextContent('Frame 2 · 2'));

      // Drains this screen's own save traffic - see the comment on "New
      // screen adds a screen..." above.
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('writes the URL hash to the switched-to screen id', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      await selectFrame('Frame 2');
      expect(window.location.hash).toBe(`#s=${SCREEN_2.id}`);
    });

    it('opens the screen named by the URL hash on mount', () => {
      window.location.hash = `#s=${SCREEN_2.id}`;
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      expect(within(frameBody()).getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      // Verify the frames chip shows Frame 2 as focused
      expect(screen.getByRole('button', { name: 'Frames' })).toHaveTextContent('Frame 2');
    });

    it('the saver receives every screen, not just the one being edited', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);

      await userEvent.click(presetButton('Mobile'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.screens).toHaveLength(2);
      expect(body.screens[0].id).toBe(SCREEN_1.id);
      expect(body.screens[0].stageWidth).toBe(375);
      // SCREEN_2 as given has no position; the initial-load layout pass
      // assigns it one (to the right of SCREEN_1) before this save ever
      // fires, so it is otherwise untouched.
      expect(body.screens[1]).toEqual({ ...SCREEN_2, x: SCREEN_1.stageWidth + 200, y: 0 });
    });

    it('New screen copies the current screen\'s device, not just its width', async () => {
      const deviceScreen: Screen = { ...SCREEN_1, stageWidth: 402, stageHeight: 874, deviceName: 'iPhone 16 & 17 Pro' };
      render(<Workbench file={makeFile({ screens: [deviceScreen] })} />);

      await addNewFrame();

      await waitFor(() =>
        expect(screen.getByTestId('stage-readout')).toHaveTextContent('iPhone 16 & 17 Pro · 402 × 874'),
      );

      // Drains this screen's own save traffic (the immediate flush from
      // switchScreen, plus Craft's onNodesChange first-fire for the brand
      // new empty Frame - a pre-existing quirk unrelated to this feature:
      // deserializing then reserializing a fresh emptyLayoutJson() is not
      // byte-identical to the string it started from, so it looks like a
      // real edit and queues one more harmless save) before this test ends.
      // Undrained, that second save's async tail can otherwise complete
      // during a LATER test and call that test's own fetchMock instead -
      // the same class of problem this file's own afterEach comment (above)
      // documents for the retry timer.
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    // Overlay frames phase 2 review, finding 3: addScreen must never
    // template a brand new plain screen off a focused OVERLAY - it should
    // fall back to the page's own most recently added plain screen, or (no
    // plain screen on the page at all) a plain desktop default.
    it('New screen while an overlay is focused falls back to the page\'s most recent plain screen, not the overlay\'s own size', async () => {
      const customPlain: Screen = { id: 'plain0001', name: 'Custom', layout: '{}', stageWidth: 900, pageId: PAGE_ID, x: 0, y: 0 };
      const overlay = createOverlayScreen({ type: 'dialog', id: 'overlay01', name: 'Dialog 1', pageId: PAGE_ID, x: 1200, y: 0 });
      render(<Workbench file={makeFile({ screens: [customPlain, overlay] })} />);

      await user.click(screen.getByRole('button', { name: 'Frames' }));
      await user.click(await screen.findByRole('menuitem', { name: /Dialog 1/ }));
      await waitFor(() => expect(screen.getByTestId('stage-readout')).toHaveTextContent('512'));

      await addNewFrame();

      await waitFor(() => expect(screen.getByTestId('stage-readout')).toHaveTextContent('900'));
      // Drains this screen's own save traffic - see the comment on "New
      // screen adds a screen..." above.
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('New screen while an overlay is focused, on a page with no plain screen at all, uses the desktop default width', async () => {
      const overlay = createOverlayScreen({ type: 'dialog', id: 'overlay02', name: 'Dialog 1', pageId: PAGE_ID, x: 0, y: 0 });
      render(<Workbench file={makeFile({ screens: [overlay] })} />);

      await addNewFrame();

      await waitFor(() => expect(screen.getByTestId('stage-readout')).toHaveTextContent('1440'));
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('switching screens restores each one\'s own device (or lack of one) in the readout', async () => {
      const deviceScreen: Screen = { ...SCREEN_1, stageWidth: 402, stageHeight: 874, deviceName: 'iPhone 16 & 17 Pro' };
      render(<Workbench file={makeFile({ screens: [deviceScreen, SCREEN_2] })} />);

      expect(screen.getByTestId('stage-readout')).toHaveTextContent('iPhone 16 & 17 Pro · 402 × 874');

      await selectFrame('Frame 2');
      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('stage-readout')).toHaveTextContent(`${SCREEN_2.stageWidth} px`));

      await selectFrame('Frame 1');
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId('stage-readout')).toHaveTextContent('iPhone 16 & 17 Pro · 402 × 874'),
      );
    });

    it('does not queue a save merely from switching to a screen that already has a device', async () => {
      const deviceScreen: Screen = { ...SCREEN_1, stageWidth: 402, stageHeight: 874, deviceName: 'iPhone 16 & 17 Pro' };
      render(<Workbench file={makeFile({ screens: [deviceScreen, SCREEN_2] })} />);

      await selectFrame('Frame 2');
      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      await selectFrame('Frame 1');
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      await new Promise((resolve) => setTimeout(resolve, 900));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('flushes the saver before switching screens, ahead of the normal debounce', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);

      await userEvent.click(presetButton('Mobile'));
      await selectFrame('Frame 2');

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
    });

    // Spec docs/superpowers/specs/2026-09-12-infinite-canvas-design.md
    // section 5: clicking a tab focuses that screen (already covered above)
    // and also starts animating the viewport to fit it.
    it('clicking a screens tab starts an animation of the canvas viewport toward that frame', async () => {
      const pending: FrameRequestCallback[] = [];
      vi.stubGlobal(
        'requestAnimationFrame',
        ((cb: FrameRequestCallback) => {
          pending.push(cb);
          return pending.length;
        }) as typeof requestAnimationFrame,
      );
      try {
        render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
        const transformBefore = screen.getByTestId('canvas-layer').style.transform;

        await selectFrame('Frame 2');

        // The animation only actually moves the viewport once its own rAF
        // loop is pumped - nothing else in this app calls
        // requestAnimationFrame, so any callback queued here is animateTo's.
        expect(pending.length).toBeGreaterThan(0);
        act(() => {
          pending.splice(0).forEach((cb) => cb(0));
          pending.splice(0).forEach((cb) => cb(100));
        });
        expect(screen.getByTestId('canvas-layer').style.transform).not.toBe(transformBefore);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('frame positions', () => {
    it('assigns positions to legacy screens on load without saving, then includes them in the next save', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);

      await new Promise((resolve) => setTimeout(resolve, 900));
      expect(fetchMock).not.toHaveBeenCalled();

      await userEvent.click(presetButton('Mobile'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.screens[0]).toMatchObject({ x: 0, y: 0 });
      expect(body.screens[1]).toMatchObject({ x: SCREEN_1.stageWidth + 200, y: 0 });
    });

    it('New screen is placed to the right of the last frame', async () => {
      render(<Workbench file={makeFile()} />);

      await addNewFrame();
      // addScreen flushes immediately (switchScreen's flush-ahead-of-debounce),
      // same as "New screen adds a screen..." above - Craft's own
      // onNodesChange first-fire for the brand new empty Frame can queue a
      // second, harmless save right behind it, so this only waits for AT
      // LEAST one call and reads the first one rather than asserting an
      // exact count.
      await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.screens[0]).toMatchObject({ x: 0, y: 0 });
      expect(body.screens[1]).toMatchObject({ x: SCREEN_1.stageWidth + 200, y: 0 });

      // Drains this screen's own extra save traffic - see the identical
      // comment on "New screen adds a screen..." above.
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('Duplicate is placed to the right of the rightmost frame in the file, never overlapping another screen', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);

      await duplicateFrame(SCREEN_1.name);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { screens: Array<{ id: string; x: number; y: number }> };
      expect(body.screens).toHaveLength(3);
      // Source (screen 0) and screen 2 (the original SCREEN_2, pushed one
      // slot over by the copy's insertion) both keep their own
      // already-resolved positions untouched.
      expect(body.screens[0]).toMatchObject({ id: SCREEN_1.id, x: 0, y: 0 });
      expect(body.screens[2]).toMatchObject({ id: SCREEN_2.id, x: SCREEN_1.stageWidth + 200, y: 0 });
      // The copy must clear BOTH existing frames, not just its source: it
      // used to chain off the source alone and land exactly on SCREEN_2
      // (which sits at the same x a plain "next to the source" rule would
      // have picked). Now it chains off the rightmost edge across every
      // positioned frame in the file - here, SCREEN_2's own right edge.
      expect(body.screens[1]).toMatchObject({
        x: SCREEN_1.stageWidth + 200 + SCREEN_2.stageWidth + 200,
        y: 0,
      });

      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('duplicating a non-focused frame does not change focus', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      // Opening Frame 2's own row submenu (to reach its Duplicate item)
      // must not, along the way, switch focus to it - the whole point of a
      // per-row action reachable without first selecting the frame.
      await openFrameRowMenu(SCREEN_2.name);
      expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      const duplicateItem = await screen.findByRole('menuitem', { name: 'Duplicate' });
      await user.click(duplicateItem);

      // The new copy becomes current (duplicateScreen's own existing,
      // pre-existing behaviour, unrelated to this test) - but SCREEN_2
      // itself, the frame duplicated FROM, was never focused along the way.
      await waitFor(() => expect(screen.getByRole('button', { name: 'Frames' })).toHaveTextContent('Frame 2 copy'));
    });

    it('Duplicating the first of three screens places the copy right of the third, not the second', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2, SCREEN_3] })} />);

      await duplicateFrame(SCREEN_1.name);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { screens: Array<{ id: string; x: number; y: number }> };
      expect(body.screens).toHaveLength(4);
      const screen2X = SCREEN_1.stageWidth + 200;
      const screen3X = screen2X + SCREEN_2.stageWidth + 200;
      expect(body.screens[2]).toMatchObject({ id: SCREEN_2.id, x: screen2X, y: 0 });
      expect(body.screens[3]).toMatchObject({ id: SCREEN_3.id, x: screen3X, y: 0 });
      // The copy (inserted right after the source, at index 1) must clear
      // screen 3 - the rightmost frame - not merely screen 2, which chaining
      // off the source alone (the old bug) would have landed it on.
      expect(body.screens[1]).toMatchObject({ x: screen3X + SCREEN_3.stageWidth + 200, y: 0 });

      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('adding a screen after a manual drag places it right of the rightmost frame, not the last one in array order', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      // Drags SCREEN_1's title far to the right of SCREEN_2, past its right
      // edge - array order stays [SCREEN_1, SCREEN_2], but SCREEN_1 is now
      // the rightmost frame on the canvas. 4000 is an 8px-snap-exact delta
      // comfortably past SCREEN_2's own right edge (SCREEN_1.stageWidth +
      // 200 + SCREEN_2.stageWidth).
      const dragDistance = 4000;
      // Scoped to the canvas frame wrapper, not a bare getByText(name): the
      // screens strip tab shows the same text ("Frame 1") beside the frame
      // title itself.
      const title = within(screen.getByTestId(`frame-${SCREEN_1.id}`)).getByText(SCREEN_1.name);
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: dragDistance, clientY: 0 });
      fireEvent.pointerUp(title, { pointerId: 1, clientX: dragDistance, clientY: 0 });

      await addNewFrame();
      // addScreen flushes immediately (switchScreen's flush-ahead-of-debounce);
      // this only waits for AT LEAST one call and reads the first one, same
      // as "New screen is placed to the right of the last frame" above.
      await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { screens: Array<{ id: string; x: number; y: number }> };
      expect(body.screens[0]).toMatchObject({ id: SCREEN_1.id, x: dragDistance, y: 0 });
      // The new screen must clear the DRAGGED SCREEN_1 (now rightmost),
      // not just SCREEN_2 (last in array order, and where the old
      // "chain off the previous array element" bug would have placed it).
      expect(body.screens[2]).toMatchObject({ x: dragDistance + SCREEN_1.stageWidth + 200, y: 0 });

      // Drains this screen's own extra save traffic - see the identical
      // comment on "New screen adds a screen..." above.
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('dragging one of several selected frames moves them all and saves every position in one patch', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title1 = within(screen.getByTestId(`frame-${SCREEN_1.id}`)).getByText(SCREEN_1.name);
      const title2 = within(screen.getByTestId(`frame-${SCREEN_2.id}`)).getByText(SCREEN_2.name);
      // Shift+click both titles into the selection, then drag the first one.
      fireEvent.pointerDown(title1, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });
      fireEvent.pointerDown(title2, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });
      fireEvent.pointerDown(title1, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title1, { pointerId: 1, clientX: 20, clientY: 0 });
      fireEvent.pointerUp(title1, { pointerId: 1, clientX: 20, clientY: 0 });

      await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { screens: Array<{ id: string; x: number; y: number }> };
      const byId = Object.fromEntries(body.screens.map((entry) => [entry.id, entry]));
      // Raw (0+20)=20 grid-snaps to 24 for the dragged frame; SCREEN_2 (not
      // itself dragged) gets the same +24 delta applied to its own starting
      // x, in the SAME patch as SCREEN_1's.
      expect(byId[SCREEN_1.id]).toMatchObject({ x: 24, y: 0 });
      expect(byId[SCREEN_2.id]).toMatchObject({ x: SCREEN_1.stageWidth + 200 + 24, y: 0 });

      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    // One of the review's named missing tests (task-grid-review.md):
    // arrow-nudging two selected frames must save both in one patch, the
    // same way a dragged multi-selection already does above.
    it('arrow-nudge of two selected frames lands in one patch', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title1 = within(screen.getByTestId(`frame-${SCREEN_1.id}`)).getByText(SCREEN_1.name);
      const title2 = within(screen.getByTestId(`frame-${SCREEN_2.id}`)).getByText(SCREEN_2.name);
      fireEvent.pointerDown(title1, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });
      fireEvent.pointerDown(title2, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { screens: Array<{ id: string; x: number; y: number }> };
      const byId = Object.fromEntries(body.screens.map((entry) => [entry.id, entry]));
      // Plain ArrowRight nudges by NUDGE_PX (1), applied to both frames'
      // already-resolved starting positions (0 and stageWidth+200).
      expect(byId[SCREEN_1.id]).toMatchObject({ x: 1, y: 0 });
      expect(byId[SCREEN_2.id]).toMatchObject({ x: SCREEN_1.stageWidth + 200 + 1, y: 0 });

      await new Promise((resolve) => setTimeout(resolve, 200));
    });
  });

  // Review fix wave item 6: selecting something else entirely must drop
  // whatever frame selection is active, the same way Figma clears a frame
  // selection the instant you select a layer or a shape - otherwise the
  // Align row (and arrow-key nudge) kept acting on frames the user's own
  // next click had already moved on from.
  describe('frame selection is cleared by other selections (review fix wave item 6)', () => {
    async function selectTwoFrames(): Promise<void> {
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));
      const title1 = within(screen.getByTestId(`frame-${SCREEN_1.id}`)).getByText(SCREEN_1.name);
      const title2 = within(screen.getByTestId(`frame-${SCREEN_2.id}`)).getByText(SCREEN_2.name);
      fireEvent.pointerDown(title1, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });
      fireEvent.pointerDown(title2, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });
      expect(screen.getByRole('button', { name: 'Align left' })).toBeInTheDocument();
    }

    it('selecting a layer clears an active frame selection', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      await selectTwoFrames();

      // A leaf Button block, not the root LayoutBox: the root is itself an
      // Auto layout container, and selecting one renders its OWN "Align
      // left" icon (LayoutAlignmentFields' align-items row, a wholly
      // different, legitimate control) - asserting the frame row is gone
      // by that same label would be a false pass/fail either way. Button
      // has no such row, so "Align left" can only mean the frame row here.
      const signIn = frameBody().querySelector('[data-block="Button"]');
      if (!signIn) throw new Error('Sign in Button block not found');
      fireEvent.mouseDown(signIn);

      // Craft's own selection change propagates through its connectors
      // asynchronously (changeRootLayoutMode, above, relies on the same
      // thing by awaiting a follow-up interaction before checking
      // anything) - waitFor gives it room to land before this asserts.
      await waitFor(() => expect(screen.getByText('Variant')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull();
    });

    it('selecting a diagram shape clears an active frame selection', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      await selectTwoFrames();

      fireEvent.keyDown(window, { key: 'D', code: 'KeyD', shiftKey: true });
      await userEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
      const surface = screen.getByTestId('diagram-placement-surface');
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 500, clientY: 500 });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 500, clientY: 500 });

      expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull();
    });
  });

  describe('layout grid / pixel grid', () => {
    it('Shift+G toggles the focused screen\'s layout grid on and saves it', async () => {
      render(<Workbench file={makeFile()} />);
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

      fireEvent.keyDown(window, { key: 'g', shiftKey: true });

      await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
        screens: Array<{ layoutGrid?: { columns: number; gutter: number; margin: number; visible: boolean } }>;
      };
      // Defaults (12/24/32) apply the first time a screen's grid is toggled.
      expect(body.screens[0].layoutGrid).toEqual({ columns: 12, gutter: 24, margin: 32, visible: true });

      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('Shift+G is ignored while typing', async () => {
      render(<Workbench file={makeFile()} />);
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

      await userEvent.click(screen.getByRole('button', { name: 'File settings' }));
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'File name' }), { key: 'g', shiftKey: true });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('Cmd+\' hides the canvas pixel grid without saving anything, and shows it again', async () => {
      render(<Workbench file={makeFile()} />);
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      const root = screen.getByTestId('canvas-root');
      expect(root.style.backgroundImage).toContain('radial-gradient');

      fireEvent.keyDown(window, { key: "'", metaKey: true });
      expect(root.style.backgroundImage).toBeFalsy();
      expect(fetchMock).not.toHaveBeenCalled();

      fireEvent.keyDown(window, { key: "'", metaKey: true });
      expect(root.style.backgroundImage).toContain('radial-gradient');
    });
  });

  describe('device presets', () => {
    it('choosing a device from the top bar queues a save with stageWidth, stageHeight and deviceName', async () => {
      render(<Workbench file={makeFile()} />);

      await userEvent.click(screen.getByRole('button', { name: 'Frame size presets' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Phone' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'iPhone 16 & 17 Pro' }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.screens[0].stageWidth).toBe(402);
      expect(body.screens[0].stageHeight).toBe(874);
      expect(body.screens[0].deviceName).toBe('iPhone 16 & 17 Pro');
      expect(body.baseUpdatedAt).toBe(BASE_FILE.updatedAt);
    });

    it('clicking a Mobile/Tablet/Desktop segment after a device queues a save clearing stageHeight and deviceName', async () => {
      const deviceScreen: Screen = { ...SCREEN_1, stageWidth: 402, stageHeight: 874, deviceName: 'iPhone 16 & 17 Pro' };
      render(<Workbench file={makeFile({ screens: [deviceScreen] })} />);

      await userEvent.click(presetButton('Desktop'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.screens[0].stageWidth).toBe(1440);
      expect(body.screens[0].stageHeight).toBeNull();
      expect(body.screens[0].deviceName).toBeNull();
    });
  });

  describe('the Files back link', () => {
    it('goes to the top level when the file has no folder', () => {
      render(<Workbench file={makeFile({ folderId: null })} />);
      expect(screen.getByRole('link', { name: 'Files' })).toHaveAttribute('href', '/');
    });

    it('goes to the file\'s folder when it has one', () => {
      render(<Workbench file={makeFile({ folderId: 'folder0001' })} />);
      expect(screen.getByRole('link', { name: 'Files' })).toHaveAttribute('href', '/folders/folder0001');
    });
  });

  describe('Present', () => {
    it('opens the play route for the current screen and updates it after switching', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      expect(screen.getByRole('link', { name: 'Present' })).toHaveAttribute(
        'href',
        `/f/${BASE_FILE.id}/play?page=${PAGE_ID}&screen=${SCREEN_1.id}`,
      );

      await selectFrame('Frame 2');

      expect(screen.getByRole('link', { name: 'Present' })).toHaveAttribute(
        'href',
        `/f/${BASE_FILE.id}/play?page=${PAGE_ID}&screen=${SCREEN_2.id}`,
      );
    });

    it('Cmd+R opens the same URL in a new tab, and prevents the browser reload', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

      const notCancelled = fireEvent.keyDown(window, { key: 'r', metaKey: true });
      expect(openSpy).toHaveBeenCalledWith(
        `/f/${BASE_FILE.id}/play?page=${PAGE_ID}&screen=${SCREEN_1.id}`,
        '_blank',
        'noopener,noreferrer',
      );
      expect(notCancelled).toBe(false);

      await selectFrame('Frame 2');
      fireEvent.keyDown(window, { key: 'r', metaKey: true });
      expect(openSpy).toHaveBeenCalledWith(
        `/f/${BASE_FILE.id}/play?page=${PAGE_ID}&screen=${SCREEN_2.id}`,
        '_blank',
        'noopener,noreferrer',
      );

      openSpy.mockRestore();
    });

    // Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-
    // frames-design.md section 4 + 5's Present entry point): Play never
    // stands ON an overlay - both entry points carry `?overlay=` instead of
    // `?screen=` while one is focused, so the Player starts on the page's
    // own first real screen with the overlay open on top.
    it('carries ?overlay= instead of ?screen= for both entry points once an overlay frame is focused', async () => {
      const overlay = createOverlayScreen({ type: 'dialog', id: 'overlay01', name: 'Dialog 1', pageId: PAGE_ID, x: 0, y: 0 });
      render(<Workbench file={makeFile({ screens: [SCREEN_1, overlay] })} />);
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

      // Not the shared selectFrame() helper: an overlay row's own mono
      // badge ("Dialog") joins its name in the row's accessible name (spec
      // section 5's badge is deliberately not aria-hidden - a screen reader
      // user browsing this menu should hear it too), so an exact-name match
      // for just "Dialog 1" no longer finds it; a substring match still does.
      await user.click(screen.getByRole('button', { name: 'Frames' }));
      await user.click(await screen.findByRole('menuitem', { name: /Dialog 1/ }));

      expect(screen.getByRole('link', { name: 'Present' })).toHaveAttribute(
        'href',
        `/f/${BASE_FILE.id}/play?page=${PAGE_ID}&overlay=${overlay.id}`,
      );

      fireEvent.keyDown(window, { key: 'r', metaKey: true });
      expect(openSpy).toHaveBeenCalledWith(
        `/f/${BASE_FILE.id}/play?page=${PAGE_ID}&overlay=${overlay.id}`,
        '_blank',
        'noopener,noreferrer',
      );

      openSpy.mockRestore();
    });

    // Phase 2 review finding 1: PAGE_ID here holds only the overlay - no
    // plain screen of its own - while SCREEN_4 lives on the file's OTHER
    // page (PAGE_2_ID). Both entry points must fall back to naming SCREEN_4
    // explicitly (and drop `page`) rather than leaving Play's own page
    // cascade (components/play/player.tsx's resolveInitialScreenId) to
    // land wherever it likes.
    it('falls back to the file\'s first plain screen for both entry points when the overlay\'s own page has none', async () => {
      const overlay = createOverlayScreen({ type: 'dialog', id: 'overlay01', name: 'Dialog 1', pageId: PAGE_ID, x: 0, y: 0 });
      render(
        <Workbench
          file={makeFile({
            pages: [
              { id: PAGE_ID, name: 'Page 1' },
              { id: PAGE_2_ID, name: 'v2' },
            ],
            screens: [SCREEN_4, overlay],
          })}
        />,
      );
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

      // Not the shared selectFrame() helper - see the comment on the
      // preceding test for why an exact name match no longer finds an
      // overlay row.
      await user.click(screen.getByRole('button', { name: 'Frames' }));
      await user.click(await screen.findByRole('menuitem', { name: /Dialog 1/ }));

      expect(screen.getByRole('link', { name: 'Present' })).toHaveAttribute(
        'href',
        `/f/${BASE_FILE.id}/play?screen=${SCREEN_4.id}&overlay=${overlay.id}`,
      );

      fireEvent.keyDown(window, { key: 'r', metaKey: true });
      expect(openSpy).toHaveBeenCalledWith(
        `/f/${BASE_FILE.id}/play?screen=${SCREEN_4.id}&overlay=${overlay.id}`,
        '_blank',
        'noopener,noreferrer',
      );

      openSpy.mockRestore();
    });
  });

  // Craft's <Editor> stays mounted across a screen switch (only the <Frame>
  // below it remounts, keyed by screen id - see the comment on <StageProvider>
  // in workbench.tsx), so its undo/redo history is a single shared stack
  // unless something clears it: without switchScreen doing that, Undo on the
  // screen you just switched to would replay the PREVIOUS screen's inverse
  // patches against this screen's own (identically-id'd) nodes.
  describe('undo history is per screen', () => {
    it('starts empty on the screen you switch to, so Undo/Redo and Cmd+Z do not touch it', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);

      await changeRootLayoutMode();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());

      await selectFrame('Frame 2');
      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();

      // The new screen's history must start empty, not inherit screen 1's.
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

      fireEvent.keyDown(window, { key: 'z', metaKey: true });

      // A no-op: the keyboard handler itself only calls actions.history.undo()
      // when query.history.canUndo() is true, so this must leave everything
      // exactly as it was - screen 2's own content, no Redo newly enabled.
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
      expect(within(frameBody()).getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(within(frameBody()).queryByRole('button', { name: 'Sign in' })).toBeNull();
    });
  });

  describe('the invalid-layout notice', () => {
    const NOTICE = 'The saved design of this screen could not be read; it starts empty.';

    it('shows only for a screen in invalidScreenIds, clears on switch, and returns until that screen is edited', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} invalidScreenIds={[SCREEN_1.id]} />);

      expect(screen.getByTestId('save-state')).toHaveTextContent(NOTICE);

      await selectFrame('Frame 2');
      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(screen.getByTestId('save-state')).not.toHaveTextContent(NOTICE);

      await selectFrame('Frame 1');
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByTestId('save-state')).toHaveTextContent(NOTICE);

      await changeRootLayoutMode();
      await waitFor(() => expect(screen.getByTestId('save-state')).not.toHaveTextContent(NOTICE));
    });

    it('does not show when no screen is invalid', () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      expect(screen.getByTestId('save-state')).not.toHaveTextContent(NOTICE);
    });
  });

  describe('editor UI state persists across a screen switch', () => {
    // Design, Prototype and Elements are one panel's mutually exclusive
    // tabs now (docs/superpowers/specs/2026-09-12-panels-and-zoom-design.md
    // section 1), so a search filter typed on the Elements tab and a
    // Prototype-mode selection can no longer be checked in the same moment
    // the way the pre-tab version of this test did - each is its own tab's
    // own state, and both, like panelMode itself, belong to the editor
    // session rather than the document, so neither may reset from a plain
    // screen switch alone.
    it('keeps the Elements search filter across a screen switch, distinct from the per-screen width readout', async () => {
      const narrowScreen2: Screen = { ...SCREEN_2, stageWidth: 375 };
      render(<Workbench file={makeFile({ screens: [SCREEN_1, narrowScreen2] })} />);

      await userEvent.click(screen.getByRole('radio', { name: 'Elements' }));
      await userEvent.type(screen.getByLabelText('Search elements'), 'Button');
      expect(screen.getByTestId('stage-readout')).toHaveTextContent('1440 px');

      await selectFrame('Frame 2');
      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();

      expect(screen.getByRole('radio', { name: 'Elements' })).toHaveAttribute('data-state', 'on');
      expect(screen.getByLabelText('Search elements')).toHaveValue('Button');
      // The width readout, in contrast, IS per screen and must update.
      await waitFor(() => expect(screen.getByTestId('stage-readout')).toHaveTextContent('375 px'));
    });

    it('keeps Prototype mode and hidden UI across a screen switch', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);

      await userEvent.click(screen.getByRole('radio', { name: 'Prototype' }));
      expect(screen.getByRole('radio', { name: 'Prototype' })).toHaveAttribute('data-state', 'on');

      await selectFrame('Frame 2');
      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Prototype' })).toHaveAttribute('data-state', 'on');

      // Hiding the UI and switching again must not bring it back by itself.
      // The screens strip hides along with everything else now (spec
      // docs/superpowers/specs/2026-09-12-infinite-canvas-design.md section
      // 4: "Cmd+\ hides all chrome and leaves the canvas") - switching while
      // hidden means clicking the other frame directly on the canvas
      // (components/workbench/stage.tsx's FramePreview), same as a sighted
      // user would with nothing but the canvas on screen.
      fireEvent.keyDown(window, { key: '\\', metaKey: true });
      expect(screen.queryByRole('complementary', { name: 'Design' })).toBeNull();

      fireEvent.pointerDown(screen.getByTestId('artboard-preview'));
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.queryByRole('complementary', { name: 'Elements' })).toBeNull();
      expect(screen.queryByRole('complementary', { name: 'Design' })).toBeNull();
    });
  });

  describe('resize handles', () => {
    it('undoes and redoes a corner resize including both dimensions', async () => {
      render(<Workbench file={makeFile()} />);
      const handle = screen.getByRole('separator', { name: 'Resize frame' });
      const original = handle.getAttribute('aria-valuetext');
      fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 60, clientY: 20, pointerId: 1 });
      fireEvent.pointerUp(handle, { clientX: 60, clientY: 20, pointerId: 1 });
      await waitFor(() => expect(handle).toHaveAttribute('aria-valuetext', `${1500} × ${ARTBOARD_MIN_HEIGHT + 20}`));
      await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(handle).toHaveAttribute('aria-valuetext', original));
      await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
      await waitFor(() => expect(handle).toHaveAttribute('aria-valuetext', `${1500} × ${ARTBOARD_MIN_HEIGHT + 20}`));
    });

    it('PATCHes stageHeight, on the current screen and with no device, when the height handle sets a fixed height', async () => {
      render(<Workbench file={makeFile()} />);

      const handle = screen.getByRole('separator', { name: 'Resize height' });
      fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(handle, { clientY: 40, pointerId: 1 });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.screens[0].stageWidth).toBe(1440);
      expect(body.screens[0].stageHeight).toBe(ARTBOARD_MIN_HEIGHT + 40);
      expect(body.screens[0].deviceName).toBeNull();
      expect(body.baseUpdatedAt).toBe(BASE_FILE.updatedAt);
    });

    it('PATCHes both stageWidth and stageHeight when the corner handle changes both', async () => {
      render(<Workbench file={makeFile()} />);

      const handle = screen.getByRole('separator', { name: 'Resize frame' });
      fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 60, clientY: 20, pointerId: 1 });
      fireEvent.pointerUp(handle, { clientX: 60, clientY: 20, pointerId: 1 });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.screens[0].stageWidth).toBe(1500);
      expect(body.screens[0].stageHeight).toBe(ARTBOARD_MIN_HEIGHT + 20);
    });

    it('shows a width x height readout, with no breakpoint, once a manual fixed height is set', async () => {
      render(<Workbench file={makeFile()} />);

      const handle = screen.getByRole('separator', { name: 'Resize height' });
      fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(handle, { clientY: 40, pointerId: 1 });

      const readout = screen.getByTestId('stage-readout');
      expect(readout).toHaveTextContent(`1440 × ${ARTBOARD_MIN_HEIGHT + 40}`);
      expect(readout).not.toHaveTextContent('desktop');
    });

    it('returns to the plain width x breakpoint readout after double-clicking the height handle back to auto', async () => {
      render(<Workbench file={makeFile()} />);

      const handle = screen.getByRole('separator', { name: 'Resize height' });
      fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(handle, { clientY: 40, pointerId: 1 });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

      fireEvent.doubleClick(handle);

      expect(screen.getByTestId('stage-readout')).toHaveTextContent('1440 px · desktop');
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1500 });
      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.screens[0].stageHeight).toBeNull();
    });
  });

  describe('Chat panel', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('switches between Layers and Chat using the left panel tabs', async () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();
      const chatButton = screen.getByRole('radio', { name: 'Chat' });
      expect(screen.getByRole('radio', { name: 'Chat' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-80');

      await userEvent.click(chatButton);

      expect(screen.getByRole('radio', { name: 'Chat' })).toHaveAttribute('aria-checked', 'true');
      const chat = screen.getByRole('complementary', { name: 'Chat' });
      expect(chat).toHaveStyle({ width: '256px' });
      expect(screen.queryByRole('complementary', { name: 'Layers panel' })).not.toBeInTheDocument();
      // Occupies the left Layers panel footprint.
      expect(chat).toHaveStyle({ left: '12px' });

      await userEvent.click(screen.getByRole('radio', { name: 'Layers' }));
      expect(screen.getByRole('radio', { name: 'Chat' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-80');
    });

    it('Cmd+J toggles the chat panel open and closed', () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();

      fireEvent.keyDown(window, { key: 'j', metaKey: true });
      expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Chat' })).toHaveAttribute('aria-checked', 'true');

      fireEvent.keyDown(window, { key: 'j', metaKey: true });
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();
    });

    it('hides with Cmd+\ along with the other panels and returns with them', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Chat' }));
      expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();
      expect(screen.queryByRole('complementary', { name: 'Design' })).toBeNull();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });
      expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: 'Design' })).toBeInTheDocument();
    });
  });

  describe('Elements tab', () => {
    function selectRoot(): void {
      const root = frameBody().querySelector('[data-block="LayoutBox"]');
      if (!root) throw new Error('root LayoutBox not found');
      fireEvent.mouseDown(root);
    }

    it('renders an Elements tab alongside Design, Prototype and Diagrams', () => {
      render(<Workbench file={makeFile()} />);
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const seg = within(panel).getByRole('radiogroup', { name: 'Panel mode' });
      expect(within(seg).getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on');
      expect(within(seg).getByRole('radio', { name: 'Prototype' })).toBeInTheDocument();
      expect(within(seg).getByRole('radio', { name: 'Elements' })).toBeInTheDocument();
      expect(within(seg).getByRole('radio', { name: 'Diagrams' })).toBeInTheDocument();
    });

    it('shows the search field and grouped list with drag sources on the Elements tab', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Elements' }));

      expect(screen.getByLabelText('Search elements')).toBeInTheDocument();
      expect(document.querySelector('[data-tray-group]')).toBeInTheDocument();
      expect(document.querySelector('[data-tray-item]')).toBeInTheDocument();
    });

    it('there is no left column (Elements lives in the right panel); the chat panel still floats in when opened', async () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-80');
      expect(screen.queryByRole('complementary', { name: 'Elements' })).toBeNull();

      await userEvent.click(screen.getByRole('radio', { name: 'Chat' }));
      expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveStyle({ left: '12px' });
    });

    it('selecting a layer while on Elements switches to Design', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Elements' }));
      expect(screen.getByRole('radio', { name: 'Elements' })).toHaveAttribute('data-state', 'on');

      selectRoot();

      await waitFor(() => expect(screen.getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on'));
    });

    it('choosing Elements while a layer is already selected is explicit and does not bounce back to Design', async () => {
      render(<Workbench file={makeFile()} />);
      selectRoot();
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on'));

      await userEvent.click(screen.getByRole('radio', { name: 'Elements' }));

      expect(screen.getByRole('radio', { name: 'Elements' })).toHaveAttribute('data-state', 'on');
    });

    it('remembers the selected tab across a remount', async () => {
      const { unmount } = render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Prototype' }));
      unmount();

      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('radio', { name: 'Prototype' })).toHaveAttribute('data-state', 'on');
    });

    it('tolerates a corrupt panel-mode value in localStorage, defaulting to Design', () => {
      localStorage.setItem('assembly-workbench:panel-mode', 'not-a-mode');
      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on');
    });
  });

  // Spec docs/superpowers/specs/2026-09-14-panel-tabs-icons-design.md: the
  // seven diagram tools that used to sit in the Elements tab's own Diagram
  // group (spec docs/superpowers/specs/2026-09-13-diagrams-design.md
  // section 13) now have their own Diagrams tab instead - same tools, same
  // shared armed-tool state, just relocated. This replaces this file's own
  // former "clicking Rectangle in the Elements tab arms placement" test.
  describe('Diagrams tab', () => {
    it('shows the seven diagram tools, none of them in Elements', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Diagrams' }));
      const panel = screen.getByRole('complementary', { name: 'Diagrams' });

      for (const label of ['Rectangle', 'Rounded', 'Decision', 'Terminal', 'Text', 'Note', 'Connector']) {
        expect(within(panel).getByRole('button', { name: label })).toBeInTheDocument();
      }

      await userEvent.click(screen.getByRole('radio', { name: 'Elements' }));
      expect(screen.queryByRole('button', { name: 'Rectangle' })).not.toBeInTheDocument();
    });

    it("clicking Rectangle in the Diagrams tab arms placement (the floating palette's Rectangle shows active)", async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Diagrams' }));
      const panel = screen.getByRole('complementary', { name: 'Diagrams' });
      expect(screen.queryByRole('toolbar', { name: 'Diagram palette' })).not.toBeInTheDocument();

      await userEvent.click(within(panel).getByRole('button', { name: 'Rectangle' }));

      const palette = screen.getByRole('toolbar', { name: 'Diagram palette' });
      expect(within(palette).getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'true');
      // The tab's own row reflects the armed tool too, now that the
      // palette it just opened renders its own same-labelled button.
      expect(within(panel).getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // useDropPlaceholder (components/workbench/drop-placeholder.tsx) has its
  // own thorough unit tests driving Craft's indicator/dragged state
  // directly; this confirms only that WorkbenchShell actually mounts it and
  // that the Editor is configured with a transparent success colour, wired
  // end to end through a real drag over the real, rendered tray and
  // artboard (spec docs/superpowers/specs/2026-09-12-drop-placeholder-
  // design.md).
  describe('Drag placeholder', () => {
    it('opens a drop slot in the artboard when a tray component is dragged over it, and removes it on drop', async () => {
      // The "Cannot update a component while rendering" regression check
      // lives in drop-placeholder-warning.test.tsx: React dedupes that
      // warning per module, and earlier tests in this file already trigger
      // one for another component, so an assertion here would pass
      // vacuously.
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Elements' }));

      const trayButton = document.querySelector('[data-tray-item="Button"]');
      if (!trayButton) throw new Error('Button tray item not found');
      const root = frameBody().querySelector('[data-block="LayoutBox"]');
      if (!root) throw new Error('root LayoutBox not found');

      // jsdom's synthetic DragEvent has no real DataTransfer of its own;
      // Craft's own `create` connector calls `dataTransfer.setDragImage(...)`
      // in its dragstart handler (the custom drag-ghost image), which
      // throws without one.
      const dataTransfer = { setDragImage: () => {}, setData: () => {}, effectAllowed: '', dropEffect: '' };
      fireEvent.dragStart(trayButton, { dataTransfer });
      fireEvent.dragOver(root, { clientX: 50, clientY: 50 });
      expect(frameBody().querySelector('[data-drop-placeholder]')).not.toBeNull();

      fireEvent.drop(root);
      expect(frameBody().querySelector('[data-drop-placeholder]')).toBeNull();

      errorSpy.mockRestore();
    });

    // The one path drop-placeholder.test.tsx's own unit tests cannot cover:
    // they drive Craft's "existing" drag state directly via
    // store.actions.setNodeEvent (see that file's own Probe comment), never
    // through a real native dragstart on a node actually rendered inside a
    // SEPARATE document the way the artboard's iframe is. Craft's `drag`
    // connector attaches directly to the node's own DOM (confirmed against
    // the vendored 0.2.12 bundle: addCraftEventListener(element, ...) is a
    // plain element.addEventListener, realm-independent), so a real
    // fireEvent.dragStart on a node inside frameBody() exercises the exact
    // review-flagged path ("the controller's browser run showed the
    // original did not collapse after dragstart at all").
    it('collapses an existing layer\'s own box one frame after it starts dragging inside the artboard, and restores it on dragend', () => {
      const pendingRaf: FrameRequestCallback[] = [];
      vi.stubGlobal(
        'requestAnimationFrame',
        ((cb: FrameRequestCallback) => {
          pendingRaf.push(cb);
          return pendingRaf.length;
        }) as typeof requestAnimationFrame,
      );

      render(<Workbench file={makeFile()} />);
      const forgotButton = within(frameBody()).getByText('Forgot your password?');
      const cardContent = forgotButton.closest('[data-zone="CardContent"]');
      if (!cardContent) throw new Error('CardContent zone not found');

      const dataTransfer = { setDragImage: () => {}, setData: () => {}, effectAllowed: '', dropEffect: '' };
      fireEvent.dragStart(forgotButton, { dataTransfer });
      fireEvent.dragOver(cardContent, { clientX: 10, clientY: 10 });

      // Not collapsed yet - the browser still needs this frame to snapshot
      // the drag image (spec: "hidden one frame after dragstart").
      expect(forgotButton.style.visibility).not.toBe('hidden');

      act(() => {
        pendingRaf.splice(0).forEach((cb) => cb(0));
      });
      expect(forgotButton.style.visibility).toBe('hidden');

      fireEvent.dragEnd(document);
      expect(forgotButton.style.visibility).not.toBe('hidden');

      vi.unstubAllGlobals();
    });

    it('leaves no placeholder and no stale inline style on a layer that is dropped into a new position', () => {
      const pendingRaf: FrameRequestCallback[] = [];
      vi.stubGlobal(
        'requestAnimationFrame',
        ((cb: FrameRequestCallback) => {
          pendingRaf.push(cb);
          return pendingRaf.length;
        }) as typeof requestAnimationFrame,
      );

      render(<Workbench file={makeFile()} />);
      const forgotButton = within(frameBody()).getByText('Forgot your password?');
      const cardContent = forgotButton.closest('[data-zone="CardContent"]');
      if (!cardContent) throw new Error('CardContent zone not found');
      const styleBefore = forgotButton.getAttribute('style');

      const dataTransfer = { setDragImage: () => {}, setData: () => {}, effectAllowed: '', dropEffect: '' };
      fireEvent.dragStart(forgotButton, { dataTransfer });
      fireEvent.dragOver(cardContent, { clientX: 10, clientY: 10 });
      act(() => {
        pendingRaf.splice(0).forEach((cb) => cb(0));
      });
      expect(forgotButton.style.visibility).toBe('hidden');

      fireEvent.drop(cardContent, { clientX: 10, clientY: 10 });
      fireEvent.dragEnd(forgotButton);

      expect(frameBody().querySelector('[data-drop-placeholder]')).toBeNull();
      // The moved layer's own DOM (Craft keeps the same element on a move)
      // carries no leftover collapse style once the drop has happened.
      const moved = within(frameBody()).getByText('Forgot your password?');
      expect(moved.style.visibility).not.toBe('hidden');
      expect(moved.getAttribute('style') ?? null).toBe(styleBefore ?? null);
      expect(
        [...frameBody().querySelectorAll('[data-block]')].some((el) => (el as HTMLElement).style.transform !== ''),
      ).toBe(false);

      vi.unstubAllGlobals();
    });
  });

  describe('Minimize panel', () => {
    it('the minimize button collapses the panel to a 40px rail and the expand button restores it to 320px', async () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-80');

      await userEvent.click(screen.getByRole('button', { name: 'Minimize panel' }));

      const panel = screen.getByRole('complementary', { name: 'Design' });
      expect(panel).toHaveClass('w-10');
      expect(within(panel).getByRole('button', { name: 'Design' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Prototype' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Elements' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Diagrams' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Expand panel' }));
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-80');
    });

    it('Cmd+. toggles the panel collapsed, with the chat panel following it to stay flush beside it', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Chat' }));
      expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveStyle({ left: '12px' });

      fireEvent.keyDown(window, { key: '.', metaKey: true });
      expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveStyle({ left: '12px' });

      fireEvent.keyDown(window, { key: '.', metaKey: true });
      expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveStyle({ left: '12px' });
    });

    it('clicking a rail icon expands the panel on that tab', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Minimize panel' }));
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByRole('button', { name: 'Elements' }));

      expect(screen.getByRole('complementary', { name: 'Elements' })).toHaveClass('w-80');
      expect(screen.getByRole('radio', { name: 'Elements' })).toHaveAttribute('data-state', 'on');
    });

    it('collapsed state persists across a remount', async () => {
      const { unmount } = render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Minimize panel' }));
      unmount();

      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-10');
      expect(screen.getByRole('button', { name: 'Expand panel' })).toBeInTheDocument();
    });
  });

  describe('D/P/E/G panel tab shortcuts', () => {
    it('D, P, E and G switch the right panel to that tab', async () => {
      render(<Workbench file={makeFile()} />);

      fireEvent.keyDown(window, { key: 'p' });
      expect(screen.getByRole('radio', { name: 'Prototype' })).toHaveAttribute('data-state', 'on');

      fireEvent.keyDown(window, { key: 'e' });
      expect(screen.getByRole('radio', { name: 'Elements' })).toHaveAttribute('data-state', 'on');

      fireEvent.keyDown(window, { key: 'g' });
      expect(screen.getByRole('radio', { name: 'Diagrams' })).toHaveAttribute('data-state', 'on');

      fireEvent.keyDown(window, { key: 'd' });
      expect(screen.getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on');
    });

    it('expand the panel when it is minimized', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Minimize panel' }));
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-10');

      fireEvent.keyDown(window, { key: 'e' });

      expect(screen.getByRole('complementary', { name: 'Elements' })).toHaveClass('w-80');
      expect(screen.getByRole('radio', { name: 'Elements' })).toHaveAttribute('data-state', 'on');
    });

    it('are ignored while typing, such as renaming the file', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('button', { name: 'File settings' }));
      fireEvent.keyDown(screen.getByTestId('file-name'), { key: 'e' });
      fireEvent.keyDown(screen.getByTestId('file-name'), { key: 'g' });
      expect(screen.getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on');
    });
  });

  describe('V pointer tool shortcut', () => {
    it('leaves the comment tool', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Comment tool' }));
      expect(screen.getByRole('button', { name: 'Comment tool' })).toHaveAttribute('aria-pressed', 'true');

      fireEvent.keyDown(window, { key: 'v' });

      expect(screen.getByRole('button', { name: 'Comment tool' })).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('shortcuts dialog', () => {
    it('opens with a bare "?"', () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();

      fireEvent.keyDown(window, { key: '?', shiftKey: true });

      expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    });

    it('opens from the Layers utility action', async () => {
      render(<Workbench file={makeFile()} />);

      await userEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));

      expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    });

    it('still opens with "?" even while the rest of the UI is hidden', () => {
      render(<Workbench file={makeFile()} />);
      fireEvent.keyDown(window, { key: '\\', metaKey: true });
      expect(screen.queryByRole('complementary', { name: 'Design' })).toBeNull();

      fireEvent.keyDown(window, { key: '?', shiftKey: true });

      expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    });
  });

  // Spec docs/superpowers/specs/2026-09-12-infinite-canvas-design.md section
  // 4 (Matt, 2026-09-12): "when the chat panel is opened, the canvas that
  // holds the frames (pages) should not scale up or down." Opening/closing
  // any panel, minimizing it, or Cmd+\ must never touch the viewport - only
  // the user zooming (or Fit/a screen tab) may.
  describe('opening/closing panels never changes the canvas viewport', () => {
    function transform(): string {
      return screen.getByTestId('canvas-layer').style.transform;
    }

    it('is untouched by opening and closing the chat panel', async () => {
      render(<Workbench file={makeFile()} />);
      const before = transform();

      await userEvent.click(screen.getByRole('radio', { name: 'Chat' }));
      expect(transform()).toBe(before);

      await userEvent.click(screen.getByRole('radio', { name: 'Layers' }));
      expect(transform()).toBe(before);
    });

    it('is untouched by minimizing and expanding the right panel', async () => {
      render(<Workbench file={makeFile()} />);
      const before = transform();

      await userEvent.click(screen.getByRole('button', { name: 'Minimize panel' }));
      expect(transform()).toBe(before);

      await userEvent.click(screen.getByRole('button', { name: 'Expand panel' }));
      expect(transform()).toBe(before);
    });

    it('is untouched by Cmd+\\ (Show/Hide UI)', () => {
      render(<Workbench file={makeFile()} />);
      const before = transform();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });
      expect(transform()).toBe(before);

      fireEvent.keyDown(window, { key: '\\', metaKey: true });
      expect(transform()).toBe(before);
    });
  });

  // Integration coverage for the real, rendered Canvas (layer-stack-menu.test.tsx
  // covers the component in isolation) - this is what actually caught the
  // infinite canvas's root element losing the data-testid the press-and-hold
  // gesture's parent-document listener queries for.
  describe('layer stack menu', () => {
    it('opens on a press-and-hold on a real layer inside the rendered frame', async () => {
      render(<Workbench file={makeFile()} />);
      const button = within(frameBody()).getByRole('button', { name: 'Sign in' });

      fireEvent.pointerDown(button, { button: 0, clientX: 50, clientY: 50 });
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(await screen.findByRole('menu')).toBeInTheDocument();
    });
  });

  // Spec docs/superpowers/specs/2026-09-12-infinite-canvas-design.md section
  // 4: the shell is no longer a grid - the canvas fills the window and
  // every other piece of chrome floats above it at a fixed position.
  describe('floating chrome', () => {
    it('the shell is a plain positioning context, not a grid', () => {
      render(<Workbench file={makeFile()} />);
      const shell = screen.getByTestId('workbench-shell');
      expect(shell.className).not.toMatch(/\bgrid\b/);
      expect(shell).toHaveClass('relative');
    });

    it('the canvas fills the window', () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.getByTestId('canvas-root')).toHaveClass('absolute', 'inset-0');
    });

    it('the top bar floats full width at the top', () => {
      render(<Workbench file={makeFile()} />);
      const header = screen.getByTestId('save-state').closest('header');
      expect(header).toHaveClass('absolute', 'top-3', 'left-3', 'right-3', 'shadow-panel');
    });

    it('the right panel floats at the right, below the top bar', () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass(
        'absolute',
        'top-[76px]',
        'right-3',
        'bottom-3',
      );
    });

    it('the frames chip shows the current frame name and page frame count', () => {
      const screen1 = { ...SCREEN_1, name: 'Login' };
      const screen2 = { ...SCREEN_2, name: 'Settings' };
      render(<Workbench file={makeFile({ screens: [screen1, screen2] })} />);
      // The frames chip is in the topbar and shows: frame name · frame count
      expect(screen.getByRole('button', { name: 'Frames' })).toHaveTextContent('Login · 2');
    });

    it('the chat panel floats below the top bar too, at the same height as the right panel', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Chat' }));
      expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveClass('absolute', 'top-[76px]', 'bottom-3');
    });

    // Spec docs/superpowers/specs/2026-09-13-frames-chip-design.md section
    // 1: the diagram palette moves to "the bottom centre of the canvas" -
    // the second headline change of that spec, alongside the frames chip
    // itself. diagram-palette.test.tsx (unaffected by this branch) only
    // covers open/closed/tool-arming/close-button, never these classes -
    // without this, a regression back to the old `absolute top-[76px]`
    // position would pass every other existing test.
    it('the diagram palette floats at the bottom centre of the canvas, not below the top bar', async () => {
      render(<Workbench file={makeFile()} />);
      fireEvent.keyDown(window, { key: 'D', code: 'KeyD', shiftKey: true });
      expect(screen.getByRole('toolbar', { name: 'Diagram palette' })).toHaveClass(
        'fixed',
        'bottom-4',
        'left-1/2',
        '-translate-x-1/2',
      );
    });
  });

  describe('pages', () => {
    function twoPageFile(): FileRecord {
      return makeFile({
        pages: [
          { id: PAGE_ID, name: 'Page 1' },
          { id: PAGE_2_ID, name: 'v2' },
        ],
        screens: [SCREEN_1, SCREEN_4],
      });
    }

    async function openPagesMenu(): Promise<void> {
      await userEvent.click(screen.getByRole('button', { name: 'Pages' }));
    }

    it('shows only the current page\'s screens, and switching pages via the menu swaps the canvas and the hash', async () => {
      render(<Workbench file={twoPageFile()} />);
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'v2' }));

      expect(await within(frameBody()).findByText('Dashboard')).toBeInTheDocument();
      expect(within(frameBody()).queryByRole('button', { name: 'Sign in' })).toBeNull();
      expect(window.location.hash).toBe(`#s=${SCREEN_4.id}`);
      expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('v2');
    });

    it('clears Craft undo history across a page switch, the same way it already does across a screen switch', async () => {
      render(<Workbench file={twoPageFile()} />);

      await changeRootLayoutMode();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'v2' }));
      await within(frameBody()).findByText('Dashboard');

      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    });

    it('New page switches to a fresh, empty page showing the "no screens yet" chip; the existing New screen button still works on it', async () => {
      render(<Workbench file={twoPageFile()} />);

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'New page' }));

      expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('Page 3');
      expect(screen.getByText('This page has no screens yet')).toBeInTheDocument();
      // The Frames chip still renders at zero frames - it's the only way to
      // add the page's first one - showing the no-current-frame placeholder
      // name and a zero count.
      expect(screen.getByRole('button', { name: 'Frames' })).toHaveTextContent('— · 0');

      await addNewFrame();
      expect(screen.queryByText('This page has no screens yet')).toBeNull();
      expect(screen.getByRole('button', { name: 'Frames' })).toHaveTextContent('Frame 1 · 1');
    });

    it('Duplicate page copies the current page\'s screens onto a new page with new ids', async () => {
      render(<Workbench file={twoPageFile()} />);

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate page' }));

      expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('Page 1 copy');
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      // The frames chip should show the duplicated screen's name
      const framesButton = screen.getByRole('button', { name: 'Frames' });
      expect(framesButton).toHaveTextContent(SCREEN_1.name);

      // Switching back confirms the original page and screen are untouched
      // (a real, independent copy, not a move).
      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Page 1' }));
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });

    it('Duplicate page copies the page\'s flow chart, re-pointing connectors at the copied screens', async () => {
      const file = twoPageFile();
      const page1 = file.pages?.[0];
      if (!page1) throw new Error('fixture needs pages');
      page1.diagram = {
        nodes: [{ id: 'n1', kind: 'decision', x: 200, y: 900, width: 160, height: 100, text: 'Go?', color: 'neutral' }],
        edges: [
          {
            id: 'e1',
            kind: 'step',
            arrow: 'end',
            source: { nodeId: 'n1', side: 'top' },
            target: { screenId: SCREEN_1.id, side: 'bottom' },
          },
        ],
      };
      render(<Workbench file={file} />);

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate page' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });

      const lastCall = fetchMock.mock.calls.at(-1) as [string, { body: string }] | undefined;
      if (!lastCall) throw new Error('expected a PATCH after Duplicate page');
      const body = JSON.parse(lastCall[1].body);
      const copiedPage = body.pages.find((p: { name: string }) => p.name === 'Page 1 copy');
      const copiedScreen = body.screens.find((s: { pageId: string }) => s.pageId === copiedPage.id);
      expect(copiedPage.diagram.nodes).toHaveLength(1);
      expect(copiedPage.diagram.nodes[0].id).not.toBe('n1');
      expect(copiedPage.diagram.nodes[0].text).toBe('Go?');
      expect(copiedPage.diagram.edges).toHaveLength(1);
      expect(copiedPage.diagram.edges[0].source.nodeId).toBe(copiedPage.diagram.nodes[0].id);
      expect(copiedPage.diagram.edges[0].target.screenId).toBe(copiedScreen.id);
      // The original page keeps its own flow chart untouched.
      const original = body.pages.find((p: { id: string }) => p.id === page1.id);
      expect(original.diagram.edges[0].target.screenId).toBe(SCREEN_1.id);
    });

    // Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-
    // frames-design.md section 5: "a connector from a screen to an overlay
    // persists and survives a page duplicate") - the same re-pointing above
    // pins for a plain screen target, generalized to an overlay one: the
    // duplicate machinery (workbench.tsx's duplicatePage, lib/diagram/
    // store.ts's cloneDiagram) builds its screenIdMap from every copied
    // screen on the page uniformly, never checking kind, so an overlay
    // frame's own id is remapped exactly like any other screen's.
    it('also re-points a connector to an OVERLAY frame at its own copy, on Duplicate page', async () => {
      const overlay = createOverlayScreen({ type: 'dialog', id: 'overlay01', name: 'Dialog 1', pageId: PAGE_ID, x: 400, y: 0 });
      const file = makeFile({
        pages: [
          { id: PAGE_ID, name: 'Page 1' },
          { id: PAGE_2_ID, name: 'v2' },
        ],
        screens: [SCREEN_1, overlay, SCREEN_4],
      });
      const page1 = file.pages?.[0];
      if (!page1) throw new Error('fixture needs pages');
      page1.diagram = {
        nodes: [{ id: 'n1', kind: 'decision', x: 200, y: 900, width: 160, height: 100, text: 'Go?', color: 'neutral' }],
        edges: [
          {
            id: 'e1',
            kind: 'step',
            arrow: 'end',
            source: { nodeId: 'n1', side: 'top' },
            target: { screenId: overlay.id, side: 'bottom' },
          },
        ],
      };
      render(<Workbench file={file} />);

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate page' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });

      const lastCall = fetchMock.mock.calls.at(-1) as [string, { body: string }] | undefined;
      if (!lastCall) throw new Error('expected a PATCH after Duplicate page');
      const body = JSON.parse(lastCall[1].body);
      const copiedPage = body.pages.find((p: { name: string }) => p.name === 'Page 1 copy');
      const copiedOverlay = body.screens.find(
        (s: { pageId: string; kind?: string }) => s.pageId === copiedPage.id && s.kind === 'overlay',
      );
      expect(copiedOverlay).toBeDefined();
      expect(copiedOverlay.id).not.toBe(overlay.id);
      expect(copiedPage.diagram.edges).toHaveLength(1);
      expect(copiedPage.diagram.edges[0].target.screenId).toBe(copiedOverlay.id);
      // The original page's own connector still points at the original overlay.
      const original = body.pages.find((p: { id: string }) => p.id === page1.id);
      expect(original.diagram.edges[0].target.screenId).toBe(overlay.id);
    });

    it('Delete page confirms naming the screen count, removes the page and switches away from it', async () => {
      render(<Workbench file={twoPageFile()} />);

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'v2' }));
      await within(frameBody()).findByText('Dashboard');

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete page' }));
      expect(await screen.findByText('Delete v2?')).toBeInTheDocument();
      expect(screen.getByText(/removes 1 screen\b/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('Page 1');
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      await openPagesMenu();
      expect(screen.queryByRole('menuitem', { name: 'v2' })).toBeNull();
      expect(screen.getByRole('menuitem', { name: 'Delete page' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('Move up reorders pages, reflected in the menu and in which page Cmd+Shift+[ cycles to', async () => {
      render(<Workbench file={twoPageFile()} />);

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'v2' }));
      await within(frameBody()).findByText('Dashboard');

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));

      // v2 is now first: Cmd+Shift+[ (previous page) from v2 wraps to the
      // new last page, "Page 1".
      fireEvent.keyDown(window, { key: '[', metaKey: true, shiftKey: true });
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('Page 1');
    });

    it('Move to page (screens strip chevron) moves a screen, which then shows up on the target page', async () => {
      render(<Workbench file={twoPageFile()} />);

      await moveFrameToPage(SCREEN_1.name, 'v2');

      // The only screen on page 1 just left it: the page is now empty.
      expect(await screen.findByText('This page has no screens yet')).toBeInTheDocument();

      await openPagesMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'v2' }));
      // Order is asserted on ids, not names: both screens are called
      // "Frame 1" (page-scoped numbering), so names could not tell them
      // apart. The moved screen joins the target page after its existing
      // screen, whatever its old file-wide index was.
      // The frames chip should show count of 2 (frame from page 2 + moved frame from page 1)
      const framesButton = screen.getByRole('button', { name: 'Frames' });
      expect(framesButton).toHaveTextContent('· 2');
      await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });
      const lastCall = fetchMock.mock.calls.at(-1) as [string, { body: string }] | undefined;
      if (!lastCall) throw new Error('expected a PATCH after Move to page');
      const body = JSON.parse(lastCall[1].body);
      const v2Page = twoPageFile().pages?.[1];
      if (!v2Page) throw new Error('fixture needs two pages');
      const v2Screens = body.screens.filter((s: { pageId: string }) => s.pageId === v2Page.id);
      expect(v2Screens.map((s: { id: string }) => s.id)).toEqual([SCREEN_4.id, SCREEN_1.id]);
    });

    it('Cmd+Shift+]/[ cycle to the next/previous page, wrapping at either end, and never fire in a text field', async () => {
      render(<Workbench file={twoPageFile()} />);
      expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('Page 1');

      fireEvent.keyDown(window, { key: ']', metaKey: true, shiftKey: true });
      expect(await within(frameBody()).findByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('v2');

      // Wraps back to "Page 1" from the last page.
      fireEvent.keyDown(window, { key: ']', metaKey: true, shiftKey: true });
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('Page 1');

      // Wraps forward to "v2" going backward from the first page.
      fireEvent.keyDown(window, { key: '[', metaKey: true, shiftKey: true });
      expect(await within(frameBody()).findByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('v2');

      await userEvent.click(screen.getByRole('button', { name: 'File settings' }));
      await userEvent.click(screen.getByTestId('file-name'));
      fireEvent.keyDown(screen.getByTestId('file-name'), { key: ']', metaKey: true, shiftKey: true });
      expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('v2');
    });

    // Review fix wave item 2 (blocker): a canvas frame selection used to be
    // one flat Set<string> with no notion of which page it belonged to -
    // switching pages left it untouched, so the Align row (and arrow-key
    // nudge) kept acting on frames the user could no longer even see, and a
    // multi-drag could fan its delta out to those invisible frames too.
    describe('frame selection is page-scoped (review fix wave item 2)', () => {
      function twoScreenTwoPageFile(): FileRecord {
        return makeFile({
          pages: [
            { id: PAGE_ID, name: 'Page 1' },
            { id: PAGE_2_ID, name: 'v2' },
          ],
          // Two screens on page 1 (so there is something to multi-select),
          // one on page 2.
          screens: [SCREEN_1, SCREEN_2, SCREEN_4],
        });
      }

      it('switching pages clears a multi-frame selection: the Align row disappears and arrow keys do nothing', async () => {
        render(<Workbench file={twoScreenTwoPageFile()} />);
        await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

        const title1 = within(screen.getByTestId(`frame-${SCREEN_1.id}`)).getByText(SCREEN_1.name);
        const title2 = within(screen.getByTestId(`frame-${SCREEN_2.id}`)).getByText(SCREEN_2.name);
        fireEvent.pointerDown(title1, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });
        fireEvent.pointerDown(title2, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });
        expect(screen.getByRole('button', { name: 'Align left' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: ']', metaKey: true, shiftKey: true });
        await within(frameBody()).findByText('Dashboard');

        expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull();

        fetchMock.mockClear();
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        await new Promise((resolve) => setTimeout(resolve, 900));
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it('a selection made on one page does not resurface after navigating away and back to it', async () => {
        render(<Workbench file={twoScreenTwoPageFile()} />);
        await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

        const title1 = within(screen.getByTestId(`frame-${SCREEN_1.id}`)).getByText(SCREEN_1.name);
        fireEvent.pointerDown(title1, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });

        await openPagesMenu();
        await userEvent.click(await screen.findByRole('menuitem', { name: 'v2' }));
        await within(frameBody()).findByText('Dashboard');

        await openPagesMenu();
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Page 1' }));
        expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();

        // A single selected frame never shows the (2+) Align row on its
        // own, so this also doubles as confirming no stray second id
        // (e.g. from page 2) is silently union'd back in.
        expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull();
      });
    });
  });

  // Review re-review R6: zoom-to-fit/zoom-to-selection used to always fall
  // back to ARTBOARD_MIN_HEIGHT for an auto-height frame, even after item 8
  // taught snapping/alignment/marquee about its real, measured height -
  // fit-all could crop a tall frame that everything else already treated
  // correctly.
  describe('zoom-to-fit uses a fed measured height (review re-review R6)', () => {
    // Mirrors canvas-frame.test.tsx's own installFakeResizeObserver: the
    // global ResizeObserverStub (vitest.setup.ts) never actually calls
    // back, so a real content-height change needs a fake that can be
    // triggered on demand. Must be installed before the frame mounts.
    // Unlike canvas-frame.test.tsx's single-observer fake, this keeps EVERY
    // callback: the workbench mounts several observers at once (CanvasFrame's
    // own auto-height one, Stage's content-height one, and more), and only
    // Stage's feeds onMeasuredHeight, so triggering just the last one
    // constructed measured nothing the fit could see.
    function installFakeResizeObserver(): { trigger: () => void } {
      const callbacks: ResizeObserverCallback[] = [];
      class FakeResizeObserver {
        constructor(cb: ResizeObserverCallback) {
          callbacks.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      return {
        trigger: () => {
          for (const cb of callbacks) cb([], {} as ResizeObserver);
        },
      };
    }

    it('fits a tall auto-height frame around its real content height once measured, not ARTBOARD_MIN_HEIGHT', async () => {
      // jsdom gives every element a zeroed getBoundingClientRect, so the
      // canvas's own measured viewportSize is effectively 0x0 here - fitAll
      // clamps zoom to MIN_ZOOM (10%) regardless of the frame's height,
      // making the zoom READOUT identical in both cases below. The centre
      // it fits AROUND still depends on the frame's own height even at a
      // pinned zoom, so this reads the persisted viewport's own y (every
      // change is saved per file/page, canvas.tsx's useCanvasViewportController)
      // instead of the readout.
      const resizeObserver = installFakeResizeObserver();
      render(<Workbench file={makeFile({ screens: [SCREEN_1] })} />);
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

      // Fit at the unmeasured default (ARTBOARD_MIN_HEIGHT = 640, centre y = 320).
      fireEvent.keyDown(window, { key: '!', code: 'Digit1', shiftKey: true });
      const before = loadViewport(window.localStorage, 'file0000ab', PAGE_ID);
      expect(before).not.toBeNull();

      // Feed a much taller measured height (centre y = 2000) and re-fit.
      Object.defineProperty(frameBody(), 'scrollHeight', { value: 4000, configurable: true });
      act(() => resizeObserver.trigger());
      // Waits for Stage's own contentHeight (and so its onMeasuredHeight
      // report) to actually land before re-fitting - the height resize
      // handle already reads directly off it (stage.tsx's effectiveHeight).
      await waitFor(() => expect(screen.getByTestId('resize-handle-height')).toHaveAttribute('aria-valuenow', '4000'));
      fireEvent.keyDown(window, { key: '!', code: 'Digit1', shiftKey: true });
      const after = loadViewport(window.localStorage, 'file0000ab', PAGE_ID);
      expect(after).not.toBeNull();

      // y = viewportSize.height/2 - centreY*zoom: at the same (clamped)
      // zoom, fitting around a centre more than 6x further down must move
      // the viewport measurably further too. The old, un-fixed code would
      // fit around the same 640px-tall box both times (identical y)
      // regardless of what scrollHeight reports.
      expect(after!.zoom).toBe(before!.zoom);
      expect(Math.abs(after!.y)).toBeGreaterThan(Math.abs(before!.y) * 2);

      vi.unstubAllGlobals();
    });
  });

  describe('diagrams', () => {
    function diagramNodes(): HTMLElement[] {
      return screen.queryAllByTestId(/^diagram-node-/);
    }

    async function placeRectangle(at: { x: number; y: number }): Promise<void> {
      fireEvent.keyDown(window, { key: 'D', code: 'KeyD', shiftKey: true });
      await userEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
      const surface = screen.getByTestId('diagram-placement-surface');
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: at.x, clientY: at.y });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: at.x, clientY: at.y });
    }

    it('Shift+D opens the palette (the top bar no longer has a diagram button)', async () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.queryByRole('button', { name: 'Diagram tool' })).toBeNull();
      expect(screen.queryByRole('toolbar', { name: 'Diagram palette' })).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'D', code: 'KeyD', shiftKey: true });

      expect(screen.getByRole('toolbar', { name: 'Diagram palette' })).toBeInTheDocument();
    });

    it('placing a shape adds it to the canvas, selects it, keeps the palette open with the pointer re-armed, and saves it', async () => {
      render(<Workbench file={makeFile()} />);

      await placeRectangle({ x: 500, y: 500 });

      expect(diagramNodes()).toHaveLength(1);
      // The bar stays for the next shape (Matt: "visible immediately and
      // closeable"); only the armed shape resets, so no palette button is
      // pressed and the Diagram tool itself still reads active.
      const palette = screen.getByRole('toolbar', { name: 'Diagram palette' });
      expect(within(palette).getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('toolbar', { name: 'Diagram palette' })).toBeInTheDocument();

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.pages[0].diagram.nodes).toHaveLength(1);
      expect(body.pages[0].diagram.nodes[0]).toMatchObject({ kind: 'rect', color: 'neutral' });
    });

    it('the palette\'s close button hides it and releases the Diagram tool', async () => {
      render(<Workbench file={makeFile()} />);
      fireEvent.keyDown(window, { key: 'D', code: 'KeyD', shiftKey: true });
      const palette = screen.getByRole('toolbar', { name: 'Diagram palette' });

      await userEvent.click(within(palette).getByRole('button', { name: 'Close diagram palette' }));

      expect(screen.queryByRole('toolbar', { name: 'Diagram palette' })).not.toBeInTheDocument();
      expect(screen.queryByRole('toolbar', { name: 'Diagram palette' })).not.toBeInTheDocument();
    });

    it('Delete removes the selected shape instead of touching the Craft selection', async () => {
      render(<Workbench file={makeFile()} />);
      await placeRectangle({ x: 500, y: 500 });
      expect(diagramNodes()).toHaveLength(1);

      fireEvent.keyDown(window, { key: 'Delete' });

      expect(diagramNodes()).toHaveLength(0);
      // The frame's own content survived - only the diagram shape was hit.
      expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });

    it('Cmd+D duplicates the selected shape with a 16px offset', async () => {
      render(<Workbench file={makeFile()} />);
      await placeRectangle({ x: 500, y: 500 });

      fireEvent.keyDown(window, { key: 'd', metaKey: true });

      expect(diagramNodes()).toHaveLength(2);
    });

    it('Cmd+D also duplicates a connector whose both endpoints are in the selection', async () => {
      render(<Workbench file={makeFile()} />);
      await placeRectangle({ x: 300, y: 300 });
      // The palette itself stays open after a placement (only the armed
      // shape resets to the pointer) - re-arm Rectangle for a second shape
      // without re-clicking "Diagram tool" itself, which would toggle the
      // still-open palette closed instead.
      await userEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
      const surface = screen.getByTestId('diagram-placement-surface');
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 700, clientY: 300 });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 700, clientY: 300 });
      expect(diagramNodes()).toHaveLength(2);

      const [aId, bId] = diagramNodes().map((el) => el.getAttribute('data-testid')!.replace('diagram-node-', ''));
      const handle = screen.getByTestId(`diagram-handle-node-${aId}-right`);
      fireEvent.pointerDown(handle, { pointerId: 2, clientX: 380, clientY: 300 });
      fireEvent.pointerMove(handle, { pointerId: 2, clientX: 700, clientY: 300 });
      fireEvent.pointerUp(handle, { pointerId: 2, clientX: 700, clientY: 300 });
      expect(screen.getByTestId(/^diagram-edge-hit-/)).toBeInTheDocument();

      // Select both shapes (the connect gesture above did not change the
      // selection left over from placing b).
      fireEvent.pointerDown(screen.getByTestId(`diagram-node-${aId}`), { pointerId: 3, clientX: 340, clientY: 300 });
      fireEvent.pointerUp(screen.getByTestId(`diagram-node-${aId}`), { pointerId: 3, clientX: 340, clientY: 300 });
      fireEvent.pointerDown(screen.getByTestId(`diagram-node-${bId}`), {
        pointerId: 3,
        clientX: 740,
        clientY: 300,
        shiftKey: true,
      });
      fireEvent.pointerUp(screen.getByTestId(`diagram-node-${bId}`), {
        pointerId: 3,
        clientX: 740,
        clientY: 300,
        shiftKey: true,
      });

      fireEvent.keyDown(window, { key: 'd', metaKey: true });

      expect(diagramNodes()).toHaveLength(4);
      expect(screen.queryAllByTestId(/^diagram-edge-hit-/)).toHaveLength(2);
    });

    it('the Design panel\'s Shape field updates after "Change shape" in the right-click menu (Build step 5)', async () => {
      render(<Workbench file={makeFile()} />);
      await placeRectangle({ x: 500, y: 500 });
      expect(screen.getByRole('combobox', { name: 'Shape' })).toHaveTextContent('Rectangle');

      fireEvent.contextMenu(diagramNodes()[0]);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Change shape' }));
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Decision' }));

      expect(screen.getByRole('combobox', { name: 'Shape' })).toHaveTextContent('Decision');
    });

    // Review finding 10 / Matt's nudge rule: a plain arrow key moves a
    // diagram selection by exactly 1px (off the 8px grid, on purpose) and
    // Shift+arrow by 8px - not the old 8px/64px, which came from move()
    // snapping every nudge to the grid regardless of the amount asked for.
    it('arrow keys nudge the selected shape by 1px, 8px with Shift', async () => {
      render(<Workbench file={makeFile()} />);
      await placeRectangle({ x: 500, y: 500 });
      // Read as a plain number now, before anything moves - the element
      // itself stays mounted across the nudge (React updates its x
      // attribute in place), so a live reference read again afterward would
      // just report the NEW value both times.
      const xBefore = Number(diagramNodes()[0].querySelector('rect')!.getAttribute('x'));

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      const afterOneNudge = Number(diagramNodes()[0].querySelector('rect')!.getAttribute('x'));
      expect(afterOneNudge - xBefore).toBe(1);

      fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
      const afterBigNudge = Number(diagramNodes()[0].querySelector('rect')!.getAttribute('x'));
      expect(afterBigNudge - afterOneNudge).toBe(8);
    });

    // Re-review finding 21: renamed from "...still snaps to the 8px grid"
    // - that overclaimed it. The DRAG'S OWN DELTA snaps to a multiple of
    // 8px; the shape's landing position does not snap back to an absolute
    // grid line, so a shape already 1px off-grid (from the nudge above)
    // stays exactly 1px off-grid after the drag too, not un-nudged onto
    // the grid.
    it('a mouse drag adds its own 8px-quantized delta, even to a shape a 1px nudge left off the grid', async () => {
      render(<Workbench file={makeFile()} />);
      await placeRectangle({ x: 500, y: 500 });
      fireEvent.keyDown(window, { key: 'ArrowRight' }); // off-grid by 1px now
      const xAfterNudge = Number(diagramNodes()[0].querySelector('rect')!.getAttribute('x'));

      const el = diagramNodes()[0];
      fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: 20, clientY: 0 });
      fireEvent.pointerUp(el, { pointerId: 1, clientX: 20, clientY: 0 });

      const xAfterDrag = Number(diagramNodes()[0].querySelector('rect')!.getAttribute('x'));
      // The raw 20px delta itself snaps to 24 (lib/diagram/geometry.ts's
      // snapToGrid) regardless of the shape's own (now off-grid) start.
      expect(xAfterDrag - xAfterNudge).toBe(24);
    });

    it('Cmd+Z undoes a diagram edit without touching Craft history, while a diagram element is selected', async () => {
      render(<Workbench file={makeFile()} />);
      await placeRectangle({ x: 500, y: 500 });
      expect(diagramNodes()).toHaveLength(1);

      fireEvent.keyDown(window, { key: 'z', metaKey: true });

      expect(diagramNodes()).toHaveLength(0);
    });

    it('clicking empty canvas clears the diagram selection so Delete falls back to Craft', async () => {
      render(<Workbench file={makeFile()} />);
      await placeRectangle({ x: 500, y: 500 });
      expect(diagramNodes()).toHaveLength(1);

      fireEvent.pointerDown(screen.getByTestId('canvas-root'));
      fireEvent.keyDown(window, { key: 'Delete' });

      // The shape is untouched - Delete no longer had a diagram selection to
      // act on, and nothing was selected in Craft either.
      expect(diagramNodes()).toHaveLength(1);
    });

    it('keeps each page\'s diagram independent', async () => {
      const file = makeFile({
        pages: [
          { id: PAGE_ID, name: 'Page 1' },
          { id: PAGE_2_ID, name: 'v2' },
        ],
        screens: [SCREEN_1, SCREEN_4],
      });
      render(<Workbench file={file} />);
      await placeRectangle({ x: 500, y: 500 });
      expect(diagramNodes()).toHaveLength(1);

      await userEvent.click(screen.getByRole('button', { name: 'Pages' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'v2' }));
      await within(frameBody()).findByText('Dashboard');

      expect(diagramNodes()).toHaveLength(0);

      await userEvent.click(screen.getByRole('button', { name: 'Pages' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Page 1' }));
      await within(frameBody()).findByRole('button', { name: 'Sign in' });

      expect(diagramNodes()).toHaveLength(1);
    });

    it('Zoom to fit widens to include a diagram shape placed far outside every frame', async () => {
      render(<Workbench file={makeFile()} />);
      // Comfortably outside SCREEN_1's own box (stageWidth from EXAMPLES[0],
      // origin (0,0)) - the readout below can only be this small if fitAll
      // was asked to fit this shape too, not just the frame.
      await placeRectangle({ x: 4000, y: 3000 });

      // A real US-layout keyboard reports Shift+1 with key "!" and
      // code "Digit1" - matchShortcut (lib/shortcuts.ts) matches on `code`
      // for exactly that reason (see its own comment there).
      fireEvent.keyDown(window, { key: '!', code: 'Digit1', shiftKey: true });

      const readout = screen.getByTestId('stage-readout').textContent ?? '';
      const percentMatch = /(\d+)%/.exec(readout);
      expect(percentMatch).not.toBeNull();
      expect(Number(percentMatch![1])).toBeLessThan(50);
    });

    // Review finding: deleteScreen/moveScreenToPage left behind a diagram
    // edge whose endpoint was the screen that just left the page.
    // validateDiagramReferences (lib/files/validate.ts) then rejects EVERY
    // later save with a 400 that lib/persistence.ts's saver never retries -
    // the file is stuck, and a reload loses everything since the last good
    // save.
    describe('pruning dangling screen references', () => {
      // Connects a rectangle (placed well outside SCREEN_1's own frame) to
      // SCREEN_1's frame, via its left handle - the same drag-a-handle-to-a-
      // frame gesture components/workbench/diagram/diagram-layer.test.tsx
      // covers in isolation, exercised here through the full Workbench so
      // the resulting edge actually lands in `pages[].diagram` the way a
      // real save would see it.
      async function connectRectangleToScreen1(): Promise<void> {
        await placeRectangle({ x: 2000, y: 100 });
        const rectId = diagramNodes()[0].getAttribute('data-testid')!.replace('diagram-node-', '');
        const handle = screen.getByTestId(`diagram-handle-node-${rectId}-left`);
        fireEvent.pointerDown(handle, { pointerId: 1, clientX: 1920, clientY: 104 });
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: 50, clientY: 50 });
        fireEvent.pointerUp(handle, { pointerId: 1, clientX: 50, clientY: 50 });
        expect(screen.getByTestId(/^diagram-edge-hit-/)).toBeInTheDocument();
      }

      it('deleting the connected screen prunes the edge from the next save, and the layer stops rendering it', async () => {
        render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
        await connectRectangleToScreen1();
        await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });
        fetchMock.mockClear();

        await deleteFrame(SCREEN_1.name);
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        // The frame is gone, so the edge can no longer resolve an endpoint -
        // it stops rendering immediately, with no separate dispatch needed.
        expect(screen.queryByTestId(/^diagram-edge-hit-/)).not.toBeInTheDocument();

        await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });
        const body = JSON.parse((fetchMock.mock.calls.at(-1) as [string, { body: string }])[1].body);
        const page1 = body.pages.find((p: { id: string }) => p.id === PAGE_ID);
        expect(page1.diagram.edges).toEqual([]);
      });

      it('moving the connected screen to another page prunes the edge from the next save, and the layer stops rendering it', async () => {
        const file = makeFile({
          pages: [
            { id: PAGE_ID, name: 'Page 1' },
            { id: PAGE_2_ID, name: 'v2' },
          ],
          screens: [SCREEN_1, SCREEN_4],
        });
        render(<Workbench file={file} />);
        await connectRectangleToScreen1();
        await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });
        fetchMock.mockClear();

        await moveFrameToPage(SCREEN_1.name, 'v2');

        expect(screen.queryByTestId(/^diagram-edge-hit-/)).not.toBeInTheDocument();

        await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });
        const body = JSON.parse((fetchMock.mock.calls.at(-1) as [string, { body: string }])[1].body);
        const page1 = body.pages.find((p: { id: string }) => p.id === PAGE_ID);
        expect(page1.diagram.edges).toEqual([]);
      });

      it('loading a file whose diagram already has a dangling screen reference renders without it, and the next save drops it', async () => {
        const staleEdge = {
          id: 'edge000001',
          source: { screenId: 'ghost00001' },
          target: { screenId: SCREEN_1.id },
          kind: 'step' as const,
          arrow: 'end' as const,
        };
        const file = makeFile({
          pages: [{ id: PAGE_ID, name: 'Page 1', diagram: { nodes: [], edges: [staleEdge] } }],
        });

        render(<Workbench file={file} />);
        expect(screen.queryByTestId(/^diagram-edge-hit-/)).not.toBeInTheDocument();

        await placeRectangle({ x: 500, y: 500 });
        await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 });
        const body = JSON.parse((fetchMock.mock.calls.at(-1) as [string, { body: string }])[1].body);
        expect(body.pages[0].diagram.edges).toEqual([]);
      });
    });
  });
});
