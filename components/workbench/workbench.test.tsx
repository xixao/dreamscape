import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EXAMPLES } from '@/lib/examples';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { Workbench } from './workbench';

// The stage-width ToggleGroupItem buttons are `role="radio"` (a single-select
// ToggleGroup is a radiogroup), not `role="button"`; matched by visible text
// instead, same as components/workbench/topbar.test.tsx's own presetButton().
function presetButton(label: string) {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`no button for ${label}`);
  return button;
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
async function changeRootLayoutMode(container: HTMLElement): Promise<void> {
  const root = container.querySelector('[data-block="LayoutBox"]');
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
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends exactly one PATCH after the debounce when a prop changes on ROOT', async () => {
    const { container } = render(<Workbench file={makeFile()} />);

    await changeRootLayoutMode(container);
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
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New frame' }));
    expect(await screen.findByText('Start a new frame?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Start a new frame?')).toBeNull());
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New frame' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Clear frame' }));
    expect(await screen.findByText('This frame is empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  describe('unchanged layout on mount', () => {
    function selectRoot(container: HTMLElement): void {
      const root = container.querySelector('[data-block="LayoutBox"]');
      if (!root) throw new Error('root LayoutBox not found');
      fireEvent.mouseDown(root);
    }

    it('sends no PATCH within 2s of fake time, even once the root gets selected with no real edit', async () => {
      vi.useFakeTimers();
      const { container } = render(<Workbench file={makeFile()} />);

      // Craft's onNodesChange fires unconditionally the first time its store
      // notifies after mount (it has nothing yet to compare that firing's
      // content against), and a plain selection - not a prop change - is
      // enough to trigger that first notification. That first firing's
      // content matches what's already stored, so it must not be queued.
      selectRoot(container);

      await vi.advanceTimersByTimeAsync(2000);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still sends exactly one PATCH for a real edit made after that unchanged first firing', async () => {
      const { container } = render(<Workbench file={makeFile()} />);
      selectRoot(container);

      // Let the (correctly suppressed) first firing's would-be debounce
      // window fully elapse before making a real edit, so the assertions
      // below can't pass by accident from the two patches merging together
      // before either is ever sent.
      await new Promise((resolve) => setTimeout(resolve, 900));
      expect(fetchMock).not.toHaveBeenCalled();

      await changeRootLayoutMode(container);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(JSON.parse(body.screens[0].layout).ROOT.props.mode).toBe('grid');
    });

    it('does not send another PATCH when the same change is applied again with no diff', async () => {
      const { container } = render(<Workbench file={makeFile()} />);

      await changeRootLayoutMode(container);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

      // Re-applying the same value: a single-select ToggleGroup treats a
      // click on the already-active item as a deselect, which the Field
      // wrapper ignores (no option matches an empty value), so this reaches
      // Craft as a no-op - if it produced a layout at all, it would be
      // identical to what was just saved, and lastSavedLayout must not let
      // a duplicate through either way.
      await changeRootLayoutMode(container);
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Show/Hide UI', () => {
    it('Cmd+\\ hides the Components and Design panels and the top bar, keeping the artboard; Cmd+\\ again restores them', () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.getByRole('complementary', { name: 'Components' })).toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: 'Design' })).toBeInTheDocument();
      expect(screen.getByTestId('save-state')).toBeInTheDocument();
      expect(screen.getByTestId('artboard')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });

      expect(screen.queryByRole('complementary', { name: 'Components' })).toBeNull();
      expect(screen.queryByRole('complementary', { name: 'Design' })).toBeNull();
      expect(screen.queryByTestId('save-state')).toBeNull();
      expect(screen.getByTestId('artboard')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });

      expect(screen.getByRole('complementary', { name: 'Components' })).toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: 'Design' })).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));

      expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
      expect(screen.getByRole('tab', { name: 'Frame 2' })).toHaveAttribute('aria-selected', 'true');
    });

    it('New screen adds a screen sized like the current one and switches to it', async () => {
      render(<Workbench file={makeFile()} />);

      await userEvent.click(screen.getByRole('button', { name: 'New screen' }));

      const tablist = screen.getByRole('tablist', { name: 'Screens' });
      expect(within(tablist).getAllByRole('tab')).toHaveLength(2);
      const newTab = within(tablist).getByRole('tab', { name: 'Frame 2' });
      expect(newTab).toHaveAttribute('aria-selected', 'true');
      expect(await screen.findByText('This frame is empty')).toBeInTheDocument();

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

    it('writes the URL hash to the switched-to screen id', async () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      expect(window.location.hash).toBe(`#s=${SCREEN_2.id}`);
    });

    it('opens the screen named by the URL hash on mount', () => {
      window.location.hash = `#s=${SCREEN_2.id}`;
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
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
      expect(body.screens[1]).toEqual(SCREEN_2);
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
      expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('stage-readout')).toHaveTextContent(`${SCREEN_2.stageWidth} px`));

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 1' }));
      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId('stage-readout')).toHaveTextContent('iPhone 16 & 17 Pro · 402 × 874'),
      );
    });

    it('does not queue a save merely from switching to a screen that already has a device', async () => {
      const deviceScreen: Screen = { ...SCREEN_1, stageWidth: 402, stageHeight: 874, deviceName: 'iPhone 16 & 17 Pro' };
      render(<Workbench file={makeFile({ screens: [deviceScreen, SCREEN_2] })} />);

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'Frame 1' }));
      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();

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
  });

  // Craft's <Editor> stays mounted across a screen switch (only the <Frame>
  // below it remounts, keyed by screen id - see the comment on <StageProvider>
  // in workbench.tsx), so its undo/redo history is a single shared stack
  // unless something clears it: without switchScreen doing that, Undo on the
  // screen you just switched to would replay the PREVIOUS screen's inverse
  // patches against this screen's own (identically-id'd) nodes.
  describe('undo history is per screen', () => {
    it('starts empty on the screen you switch to, so Undo/Redo and Cmd+Z do not touch it', async () => {
      const { container } = render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);

      await changeRootLayoutMode(container);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();

      // The new screen's history must start empty, not inherit screen 1's.
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

      fireEvent.keyDown(window, { key: 'z', metaKey: true });

      // A no-op: the keyboard handler itself only calls actions.history.undo()
      // when query.history.canUndo() is true, so this must leave everything
      // exactly as it was - screen 2's own content, no Redo newly enabled.
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    });
  });

  describe('the invalid-layout notice', () => {
    const NOTICE = 'The saved design of this screen could not be read; it starts empty.';

    it('shows only for a screen in invalidScreenIds, clears on switch, and returns until that screen is edited', async () => {
      const { container } = render(
        <Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} invalidScreenIds={[SCREEN_1.id]} />,
      );

      expect(screen.getByTestId('save-state')).toHaveTextContent(NOTICE);

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      expect(screen.getByTestId('save-state')).not.toHaveTextContent(NOTICE);

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 1' }));
      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByTestId('save-state')).toHaveTextContent(NOTICE);

      await changeRootLayoutMode(container);
      await waitFor(() => expect(screen.getByTestId('save-state')).not.toHaveTextContent(NOTICE));
    });

    it('does not show when no screen is invalid', () => {
      render(<Workbench file={makeFile({ screens: [SCREEN_1, SCREEN_2] })} />);
      expect(screen.getByTestId('save-state')).not.toHaveTextContent(NOTICE);
    });
  });

  describe('editor UI state persists across a screen switch', () => {
    it('keeps Prototype mode, the Components search filter and hidden UI, and updates the width readout', async () => {
      const narrowScreen2: Screen = { ...SCREEN_2, stageWidth: 375 };
      render(<Workbench file={makeFile({ screens: [SCREEN_1, narrowScreen2] })} />);

      await userEvent.type(screen.getByLabelText('Search components'), 'Button');
      await userEvent.click(screen.getByRole('radio', { name: 'Prototype' }));
      expect(screen.getByRole('radio', { name: 'Prototype' })).toHaveAttribute('data-state', 'on');
      expect(screen.getByTestId('stage-readout')).toHaveTextContent('1440 px');

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 2' }));
      expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();

      // Neither the search filter nor the panel mode is specific to a
      // screen - both belong to the editor session, not the document, so
      // they must survive the switch untouched.
      expect(screen.getByLabelText('Search components')).toHaveValue('Button');
      expect(screen.getByRole('radio', { name: 'Prototype' })).toHaveAttribute('data-state', 'on');
      // The width readout, in contrast, IS per screen and must update.
      await waitFor(() => expect(screen.getByTestId('stage-readout')).toHaveTextContent('375 px'));

      // Hiding the UI and switching again must not bring it back by itself.
      // The screens strip stays visible even with the rest of the UI
      // hidden (see the "Show/Hide UI" tests above), so switching is still
      // possible without it.
      fireEvent.keyDown(window, { key: '\\', metaKey: true });
      expect(screen.queryByRole('complementary', { name: 'Components' })).toBeNull();

      await userEvent.click(screen.getByRole('tab', { name: 'Frame 1' }));
      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.queryByRole('complementary', { name: 'Components' })).toBeNull();
      expect(screen.queryByRole('complementary', { name: 'Design' })).toBeNull();
    });
  });

  describe('Chat panel', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('is closed by default; the topbar button opens it as a fourth column, reflected in aria-pressed', async () => {
      render(<Workbench file={makeFile()} />);
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();
      const chatButton = screen.getByRole('button', { name: 'Chat' });
      expect(chatButton).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('workbench-shell')).toHaveClass('grid-cols-[280px_1fr_320px]');

      await userEvent.click(chatButton);

      expect(chatButton).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();
      expect(screen.getByTestId('workbench-shell')).toHaveClass('grid-cols-[280px_1fr_320px_360px]');

      await userEvent.click(chatButton);
      expect(chatButton).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByRole('complementary', { name: 'Chat' })).toBeNull();
      expect(screen.getByTestId('workbench-shell')).toHaveClass('grid-cols-[280px_1fr_320px]');
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
      expect(screen.queryByRole('complementary', { name: 'Components' })).toBeNull();

      fireEvent.keyDown(window, { key: '\\', metaKey: true });
      expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: 'Components' })).toBeInTheDocument();
    });
  });
});
