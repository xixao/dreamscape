import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EXAMPLES } from '@/lib/examples';
import type { FileRecord } from '@/lib/files/repository';
import { Workbench } from './workbench';

// The stage-width ToggleGroupItem buttons are `role="radio"` (a single-select
// ToggleGroup is a radiogroup), not `role="button"`; matched by visible text
// instead, same as components/workbench/topbar.test.tsx's own presetButton().
function presetButton(label: string) {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`no button for ${label}`);
  return button;
}

const BASE_FILE: FileRecord = {
  id: 'file0000ab',
  name: 'Untitled',
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
  layout: EXAMPLES[0].layout,
  stageWidth: EXAMPLES[0].stageWidth,
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
    fetchMock = vi.fn().mockResolvedValue(ok('T1'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the layout passed in file.layout', () => {
    render(<Workbench file={makeFile()} layoutInvalid={false} />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends exactly one PATCH after the debounce when a prop changes on ROOT', async () => {
    const { container } = render(<Workbench file={makeFile()} layoutInvalid={false} />);

    await changeRootLayoutMode(container);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/files/${BASE_FILE.id}`);
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(body.baseUpdatedAt).toBe(BASE_FILE.updatedAt);
    expect(typeof body.layout).toBe('string');
    expect(JSON.parse(body.layout).ROOT.props.mode).toBe('grid');
  });

  it('shows Saving then Saved in the topbar', async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    fetchMock.mockReturnValueOnce(pending);
    render(<Workbench file={makeFile()} layoutInvalid={false} />);

    await userEvent.click(presetButton('Mobile'));
    await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('Saving'), {
      timeout: 1500,
    });

    resolveFetch(ok('T1'));
    await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('Saved'));
  });

  it('shows the conflict message and a Reload button after a 409 response', async () => {
    fetchMock.mockResolvedValueOnce(conflict('Tserver'));
    render(<Workbench file={makeFile()} layoutInvalid={false} />);

    await userEvent.click(presetButton('Mobile'));

    await waitFor(
      () => expect(screen.getByTestId('save-state')).toHaveTextContent('Someone else changed this file.'),
      { timeout: 1500 },
    );
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('PATCHes the new stage width when the frame width changes', async () => {
    render(<Workbench file={makeFile()} layoutInvalid={false} />);

    await userEvent.click(presetButton('Mobile'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stageWidth).toBe(375);
    expect(body.baseUpdatedAt).toBe(BASE_FILE.updatedAt);
  });

  it('PATCHes the new name when the file name field is renamed', async () => {
    render(<Workbench file={makeFile({ name: 'Untitled' })} layoutInvalid={false} />);

    const field = screen.getByTestId('file-name');
    await userEvent.clear(field);
    await userEvent.type(field, 'My design{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.name).toBe('My design');
  });

  it('shows the invalid-layout notice in place of the save state', () => {
    render(<Workbench file={makeFile()} layoutInvalid={true} />);
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'The saved design could not be read; this file starts empty.',
    );
  });

  it('does not save an invalid layout until the user makes a real change, then clears the notice', async () => {
    render(<Workbench file={makeFile()} layoutInvalid={true} />);
    expect(screen.getByTestId('save-state')).toHaveTextContent('starts empty');

    // Give any mount-only effect a moment to (not) fire before checking.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('save-state')).toHaveTextContent('starts empty');

    await userEvent.click(presetButton('Mobile'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1500 });
    expect(screen.getByTestId('save-state')).not.toHaveTextContent('starts empty');
    await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('Saved'));
  });

  it('flushes a pending save on unmount', async () => {
    const { unmount } = render(<Workbench file={makeFile()} layoutInvalid={false} />);

    await userEvent.click(presetButton('Mobile'));
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('flushes a pending save on pagehide', async () => {
    render(<Workbench file={makeFile()} layoutInvalid={false} />);

    await userEvent.click(presetButton('Mobile'));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('New frame still clears the layout after confirming', async () => {
    render(<Workbench file={makeFile()} layoutInvalid={false} />);
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
      const { container } = render(<Workbench file={makeFile()} layoutInvalid={false} />);

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
      const { container } = render(<Workbench file={makeFile()} layoutInvalid={false} />);
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
      expect(JSON.parse(body.layout).ROOT.props.mode).toBe('grid');
    });

    it('does not send another PATCH when the same change is applied again with no diff', async () => {
      const { container } = render(<Workbench file={makeFile()} layoutInvalid={false} />);

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
      render(<Workbench file={makeFile()} layoutInvalid={false} />);
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
});
