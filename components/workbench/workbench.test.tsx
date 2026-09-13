import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EXAMPLES } from '@/lib/examples';
import type { FileRecord, Screen } from '@/lib/files/repository';
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
const SCREEN_1: Screen = {
  id: 'screen0001',
  name: 'Frame 1',
  layout: EXAMPLES[0].layout,
  stageWidth: EXAMPLES[0].stageWidth,
};
const SCREEN_2: Screen = {
  id: 'screen0002',
  name: 'Frame 2',
  layout: EXAMPLES[2].layout, // Settings: has a "Save changes" button, unlike Login.
  stageWidth: EXAMPLES[2].stageWidth,
};
// Used only by the "frame positions" tests below, which need a third screen
// and never assert on its rendered content.
const SCREEN_3: Screen = {
  id: 'screen0003',
  name: 'Frame 3',
  layout: EXAMPLES[1].layout,
  stageWidth: EXAMPLES[1].stageWidth,
};

const BASE_FILE: FileRecord = {
  id: 'file0000ab',
  name: 'Untitled',
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
  folderId: null,
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

  it('New frame still clears the layout after confirming', async () => {
    render(<Workbench file={makeFile()} />);
    expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New frame' }));
    expect(await screen.findByText('Start a new frame?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Start a new frame?')).toBeNull());
    expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New frame' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Clear frame' }));
    expect(await within(frameBody()).findByText('This frame is empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
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

      fireEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      await vi.advanceTimersByTimeAsync(1500);
      fireEvent.click(screen.getByRole('tab', { name: 'Frame 1' }));
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
    it('Cmd+\\ hides the right panel, the top bar and the screens strip, keeping the canvas; Cmd+\\ again restores them', () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('complementary', { name: 'Design' })).toBeInTheDocument();
      expect(screen.getByTestId('save-state')).toBeInTheDocument();
      expect(screen.getByTestId('artboard')).toBeInTheDocument();
      expect(screen.getByRole('tablist', { name: 'Screens' })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });

      expect(screen.queryByRole('complementary', { name: 'Design' })).toBeNull();
      expect(screen.queryByTestId('save-state')).toBeNull();
      // The screens strip hides too now (spec docs/superpowers/specs/
      // 2026-09-12-infinite-canvas-design.md section 4: "Cmd+\ hides all
      // chrome and leaves the canvas") - unlike the old single-frame model,
      // switching screens while hidden no longer needs it (see the
      // "editor UI state persists" test, which switches by clicking the
      // other frame directly on the canvas instead).
      expect(screen.queryByRole('tablist', { name: 'Screens' })).toBeNull();
      expect(screen.getByTestId('artboard')).toBeInTheDocument();
      expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });

      expect(screen.getByRole('complementary', { name: 'Design' })).toBeInTheDocument();
      expect(screen.getByRole('tablist', { name: 'Screens' })).toBeInTheDocument();
      expect(screen.getByTestId('artboard')).toBeInTheDocument();
    });
  });

  describe('screens', () => {
    it('renders a chip for each screen, the first active by default', () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      const tablist = screen.getByRole('tablist', { name: 'Screens' });
      expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Frame 1', 'Frame 2']);
      expect(within(tablist).getByRole('tab', { name: 'Frame 1' })).toHaveAttribute('aria-selected', 'true');
    });

    it('switching screens swaps the artboard content', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      expect(within(frameBody()).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));

      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(within(frameBody()).queryByRole('button', { name: 'Sign in' })).toBeNull();
      expect(screen.getByRole('tab', { name: 'Frame 2' })).toHaveAttribute('aria-selected', 'true');
    });

    it('New screen adds a screen sized like the current one and switches to it', async () => {
      render(<Workbench file={makeFile()} />);

      await userEvent.click(screen.getByRole('button', { name: 'New screen' }));

      const tablist = screen.getByRole('tablist', { name: 'Screens' });
      expect(within(tablist).getAllByRole('tab')).toHaveLength(2);
      const newTab = within(tablist).getByRole('tab', { name: 'Frame 2' });
      expect(newTab).toHaveAttribute('aria-selected', 'true');
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

      const tablist = screen.getByRole('tablist', { name: 'Screens' });
      expect(within(tablist).getAllByRole('tab')).toHaveLength(2);
      expect(within(tablist).getByRole('tab', { name: 'Frame 2' })).toHaveAttribute('aria-selected', 'true');

      // Drains this screen's own save traffic - see the comment on "New
      // screen adds a screen..." above.
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it('writes the URL hash to the switched-to screen id', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      expect(window.location.hash).toBe(`#s=${SCREEN_2.id}`);
    });

    it('opens the screen named by the URL hash on mount', () => {
      window.location.hash = `#s=${SCREEN_2.id}`;
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      expect(within(frameBody()).getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Frame 2' })).toHaveAttribute('aria-selected', 'true');
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

      await userEvent.click(screen.getByRole('button', { name: 'New screen' }));

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

    it('switching screens restores each one\'s own device (or lack of one) in the readout', async () => {
      const deviceScreen: Screen = { ...SCREEN_1, stageWidth: 402, stageHeight: 874, deviceName: 'iPhone 16 & 17 Pro' };
      render(<Workbench file={makeFile({ screens: [deviceScreen, SCREEN_2] })} />);

      expect(screen.getByTestId('stage-readout')).toHaveTextContent('iPhone 16 & 17 Pro · 402 × 874');

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('stage-readout')).toHaveTextContent(`${SCREEN_2.stageWidth} px`));

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 1' }));
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId('stage-readout')).toHaveTextContent('iPhone 16 & 17 Pro · 402 × 874'),
      );
    });

    it('does not queue a save merely from switching to a screen that already has a device', async () => {
      const deviceScreen: Screen = { ...SCREEN_1, stageWidth: 402, stageHeight: 874, deviceName: 'iPhone 16 & 17 Pro' };
      render(<Workbench file={makeFile({ screens: [deviceScreen, SCREEN_2] })} />);

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'Frame 1' }));
      expect(await within(frameBody()).findByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      await new Promise((resolve) => setTimeout(resolve, 900));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('flushes the saver before switching screens, ahead of the normal debounce', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);

      await userEvent.click(presetButton('Mobile'));
      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));

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

        await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));

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

      await userEvent.click(screen.getByRole('button', { name: 'New screen' }));
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

      await userEvent.click(screen.getByRole('button', { name: `${SCREEN_1.name} menu` }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
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

    it('Duplicating the first of three screens places the copy right of the third, not the second', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2, SCREEN_3] })} />);

      await userEvent.click(screen.getByRole('button', { name: `${SCREEN_1.name} menu` }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
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

      await userEvent.click(screen.getByRole('button', { name: 'New screen' }));
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
        `/f/${BASE_FILE.id}/play?screen=${SCREEN_1.id}`,
      );

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));

      expect(screen.getByRole('link', { name: 'Present' })).toHaveAttribute(
        'href',
        `/f/${BASE_FILE.id}/play?screen=${SCREEN_2.id}`,
      );
    });

    it('Cmd+R opens the same URL in a new tab, and prevents the browser reload', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

      const notCancelled = fireEvent.keyDown(window, { key: 'r', metaKey: true });
      expect(openSpy).toHaveBeenCalledWith(
        `/f/${BASE_FILE.id}/play?screen=${SCREEN_1.id}`,
        '_blank',
        'noopener,noreferrer',
      );
      expect(notCancelled).toBe(false);

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      fireEvent.keyDown(window, { key: 'r', metaKey: true });
      expect(openSpy).toHaveBeenCalledWith(
        `/f/${BASE_FILE.id}/play?screen=${SCREEN_2.id}`,
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

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
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

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(screen.getByTestId('save-state')).not.toHaveTextContent(NOTICE);

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 1' }));
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
    // Design, Prototype and Components are one panel's mutually exclusive
    // tabs now (docs/superpowers/specs/2026-09-12-panels-and-zoom-design.md
    // section 1), so a search filter typed on the Components tab and a
    // Prototype-mode selection can no longer be checked in the same moment
    // the way the pre-tab version of this test did - each is its own tab's
    // own state, and both, like panelMode itself, belong to the editor
    // session rather than the document, so neither may reset from a plain
    // screen switch alone.
    it('keeps the Components search filter across a screen switch, distinct from the per-screen width readout', async () => {
      const narrowScreen2: Screen = { ...SCREEN_2, stageWidth: 375 };
      render(<Workbench file={makeFile({ screens: [SCREEN_1, narrowScreen2] })} />);

      await userEvent.click(screen.getByRole('radio', { name: 'Components' }));
      await userEvent.type(screen.getByLabelText('Search components'), 'Button');
      expect(screen.getByTestId('stage-readout')).toHaveTextContent('1440 px');

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      expect(await within(frameBody()).findByRole('button', { name: 'Save changes' })).toBeInTheDocument();

      expect(screen.getByRole('radio', { name: 'Components' })).toHaveAttribute('data-state', 'on');
      expect(screen.getByLabelText('Search components')).toHaveValue('Button');
      // The width readout, in contrast, IS per screen and must update.
      await waitFor(() => expect(screen.getByTestId('stage-readout')).toHaveTextContent('375 px'));
    });

    it('keeps Prototype mode and hidden UI across a screen switch', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);

      await userEvent.click(screen.getByRole('radio', { name: 'Prototype' }));
      expect(screen.getByRole('radio', { name: 'Prototype' })).toHaveAttribute('data-state', 'on');

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
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
      expect(screen.queryByRole('complementary', { name: 'Components' })).toBeNull();
      expect(screen.queryByRole('complementary', { name: 'Design' })).toBeNull();
    });
  });

  describe('resize handles', () => {
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

    it('is closed by default; the topbar button opens it floating beside the right panel, reflected in aria-pressed', async () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();
      const chatButton = screen.getByRole('button', { name: 'Chat' });
      expect(chatButton).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-80');

      await userEvent.click(chatButton);

      expect(chatButton).toHaveAttribute('aria-pressed', 'true');
      const chat = screen.getByRole('complementary', { name: 'Chat' });
      expect(chat).toHaveClass('w-[360px]');
      // Floats immediately left of the (expanded, 320px) right panel.
      expect(chat).toHaveClass('right-[336px]');

      await userEvent.click(chatButton);
      expect(chatButton).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-80');
    });

    it('Cmd+J toggles the chat panel open and closed', () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();

      fireEvent.keyDown(window, { key: 'j', metaKey: true });
      expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'true');

      fireEvent.keyDown(window, { key: 'j', metaKey: true });
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();
    });

    it('hides with Cmd+\ along with the other panels and returns with them', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Chat' }));
      expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();
      expect(screen.queryByRole('complementary', { name: 'Design' })).toBeNull();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });
      expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: 'Design' })).toBeInTheDocument();
    });
  });

  describe('Components tab', () => {
    function selectRoot(): void {
      const root = frameBody().querySelector('[data-block="LayoutBox"]');
      if (!root) throw new Error('root LayoutBox not found');
      fireEvent.mouseDown(root);
    }

    it('renders a third Components tab alongside Design and Prototype', () => {
      render(<Workbench file={makeFile()} />);
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const seg = within(panel).getByRole('radiogroup', { name: 'Panel mode' });
      expect(within(seg).getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on');
      expect(within(seg).getByRole('radio', { name: 'Prototype' })).toBeInTheDocument();
      expect(within(seg).getByRole('radio', { name: 'Components' })).toBeInTheDocument();
    });

    it('shows the search field and grouped list with drag sources on the Components tab', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Components' }));

      expect(screen.getByLabelText('Search components')).toBeInTheDocument();
      expect(document.querySelector('[data-tray-group]')).toBeInTheDocument();
      expect(document.querySelector('[data-tray-item]')).toBeInTheDocument();
    });

    it('there is no left column (Components lives in the right panel); the chat panel still floats in when opened', async () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-80');
      expect(screen.queryByRole('complementary', { name: 'Components' })).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: 'Chat' }));
      expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveClass('right-[336px]');
    });

    it('selecting a layer while on Components switches to Design', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Components' }));
      expect(screen.getByRole('radio', { name: 'Components' })).toHaveAttribute('data-state', 'on');

      selectRoot();

      await waitFor(() => expect(screen.getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on'));
    });

    it('choosing Components while a layer is already selected is explicit and does not bounce back to Design', async () => {
      render(<Workbench file={makeFile()} />);
      selectRoot();
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on'));

      await userEvent.click(screen.getByRole('radio', { name: 'Components' }));

      expect(screen.getByRole('radio', { name: 'Components' })).toHaveAttribute('data-state', 'on');
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

  describe('Minimize panel', () => {
    it('the minimize button collapses the panel to a 40px rail and the expand button restores it to 320px', async () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-80');

      await userEvent.click(screen.getByRole('button', { name: 'Minimize panel' }));

      const panel = screen.getByRole('complementary', { name: 'Design' });
      expect(panel).toHaveClass('w-10');
      expect(within(panel).getByRole('button', { name: 'Design' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Prototype' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Components' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Expand panel' }));
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-80');
    });

    it('Cmd+. toggles the panel collapsed, with the chat panel following it to stay flush beside it', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Chat' }));
      expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveClass('right-[336px]');

      fireEvent.keyDown(window, { key: '.', metaKey: true });
      expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveClass('right-[56px]');

      fireEvent.keyDown(window, { key: '.', metaKey: true });
      expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveClass('right-[336px]');
    });

    it('clicking a rail icon expands the panel on that tab', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Minimize panel' }));
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByRole('button', { name: 'Components' }));

      expect(screen.getByRole('complementary', { name: 'Components' })).toHaveClass('w-80');
      expect(screen.getByRole('radio', { name: 'Components' })).toHaveAttribute('data-state', 'on');
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

  describe('D/P/E panel tab shortcuts', () => {
    it('D, P and E switch the right panel to that tab', async () => {
      render(<Workbench file={makeFile()} />);

      fireEvent.keyDown(window, { key: 'p' });
      expect(screen.getByRole('radio', { name: 'Prototype' })).toHaveAttribute('data-state', 'on');

      fireEvent.keyDown(window, { key: 'e' });
      expect(screen.getByRole('radio', { name: 'Components' })).toHaveAttribute('data-state', 'on');

      fireEvent.keyDown(window, { key: 'd' });
      expect(screen.getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on');
    });

    it('expand the panel when it is minimized', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Minimize panel' }));
      expect(screen.getByRole('complementary', { name: 'Design' })).toHaveClass('w-10');

      fireEvent.keyDown(window, { key: 'e' });

      expect(screen.getByRole('complementary', { name: 'Components' })).toHaveClass('w-80');
      expect(screen.getByRole('radio', { name: 'Components' })).toHaveAttribute('data-state', 'on');
    });

    it('are ignored while typing, such as renaming the file', () => {
      render(<Workbench file={makeFile()} />);
      fireEvent.keyDown(screen.getByTestId('file-name'), { key: 'e' });
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

      await userEvent.click(screen.getByRole('button', { name: 'Chat' }));
      expect(transform()).toBe(before);

      await userEvent.click(screen.getByRole('button', { name: 'Chat' }));
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
      expect(header).toHaveClass('absolute', 'top-3', 'left-3', 'right-3', 'shadow-panel-lg');
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

    it('the screens strip floats at the top-left of the canvas, beneath the top bar', () => {
      render(<Workbench file={makeFile()} />);
      const strip = screen.getByRole('tablist', { name: 'Screens' }).closest('[class*="absolute"]');
      expect(strip).toHaveClass('absolute', 'top-[76px]', 'left-3');
    });

    it('the chat panel floats below the top bar too, at the same height as the right panel', async () => {
      render(<Workbench file={makeFile()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Chat' }));
      expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveClass('absolute', 'top-[76px]', 'bottom-3');
    });
  });
});
