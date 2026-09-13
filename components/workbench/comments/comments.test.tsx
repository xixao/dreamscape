import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { saveViewport } from '@/lib/canvas/viewport-store';
import { getAuthorName } from '@/lib/comments/store';
import { EXAMPLES } from '@/lib/examples';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { SECONDARY_BUTTON } from '../chrome';
import { Workbench } from '../workbench';

// The bundled Login screen example, not a hand-built or emptyLayoutJson()
// layout: workbench.test.tsx's own SCREEN_1 uses the same example for the
// same reason (see its comment) - Craft's deserialize normalizes a node's
// props against that component's craft.props defaults, and a hand-built or
// empty layout is not guaranteed to already match that normalized form, so
// its very first mount can look like a real edit and queue an unwanted
// save. Zoom is pinned to 1 below (a stored viewport, so Canvas never runs
// its own fitAll) rather than left to default, so the example's own width
// works fine for these tests regardless of stageWidth.
const PAGE_ID = 'page000001';
const SCREEN: Screen = {
  id: 'screen0001',
  name: 'Frame 1',
  layout: EXAMPLES[0].layout,
  stageWidth: EXAMPLES[0].stageWidth,
  pageId: PAGE_ID,
};
const FILE_ID = 'file0000ab';
const BASE_FILE: FileRecord = {
  id: FILE_ID,
  name: 'Untitled',
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
  folderId: null,
  pages: [{ id: PAGE_ID, name: 'Page 1' }],
  screens: [SCREEN],
};

const THREADS_KEY = `assembly-workbench:comments:${FILE_ID}`;

// Fixed so `(clientX - rect.left) / zoom` and friends land on round numbers.
const ARTBOARD_RECT = {
  left: 100,
  top: 50,
  width: 400,
  height: 800,
  right: 500,
  bottom: 850,
  x: 100,
  y: 50,
  toJSON: () => ({}),
} as DOMRect;

function storedThreads(): Array<{ x: number; y: number; author: string; text: string }> {
  const raw = window.localStorage.getItem(THREADS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function enableCommentMode() {
  await userEvent.click(screen.getByRole('button', { name: 'Comment tool' }));
}

function clickArtboard(clientX: number, clientY: number) {
  fireEvent.mouseDown(screen.getByTestId('artboard'), { clientX, clientY });
}

async function fillComposer({ name, text }: { name?: string; text: string }) {
  if (name !== undefined) {
    await userEvent.type(screen.getByLabelText('Your name'), name);
  }
  await userEvent.type(screen.getByLabelText('Add a comment'), text);
}

async function submitComposer() {
  await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
}

/** Places a pin at a fixed point and submits it with the given name/text, leaving comment mode. */
async function addComment({ name, text }: { name?: string; text: string }) {
  await enableCommentMode();
  clickArtboard(150, 120);
  await screen.findByRole('dialog', { name: 'New comment' });
  await fillComposer({ name, text });
  await submitComposer();
}

describe('comments placeholder', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let rectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '';
    window.localStorage.clear();
    // Pins the canvas viewport to zoom 1 with no pan, so Canvas's own
    // fitAll-on-first-measure (components/workbench/canvas.tsx) never runs -
    // without this, ARTBOARD_RECT below (mocked on every HTMLElement, so it
    // also answers for the canvas's own root) would get fitAll'd into a
    // resulting zoom far from 1, throwing off every artboard-coordinate math
    // this file checks.
    saveViewport(window.localStorage, FILE_ID, PAGE_ID, { x: 0, y: 0, zoom: 1 });
    rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(ARTBOARD_RECT);
  });

  afterEach(() => {
    rectSpy.mockRestore();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.location.hash = '';
    window.localStorage.clear();
  });

  it('toggles comment mode with the button (aria-pressed, crosshair cursor) and Shift+C', async () => {
    render(<Workbench file={BASE_FILE} />);
    const button = screen.getByRole('button', { name: 'Comment tool' });
    const artboard = screen.getByTestId('artboard-zoom');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(artboard).not.toHaveClass('cursor-crosshair');

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(artboard).toHaveClass('cursor-crosshair');

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(artboard).not.toHaveClass('cursor-crosshair');

    fireEvent.keyDown(window, { key: 'c', shiftKey: true });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(artboard).toHaveClass('cursor-crosshair');
  });

  it('a click in comment mode places a pending pin at the expected artboard coordinates and opens the composer', async () => {
    render(<Workbench file={BASE_FILE} />);
    await enableCommentMode();

    clickArtboard(150, 120);

    expect(await screen.findByRole('dialog', { name: 'New comment' })).toBeInTheDocument();
    // Nothing is persisted yet - only submitting creates a thread.
    expect(storedThreads()).toHaveLength(0);

    await fillComposer({ name: 'Matt', text: 'Move this button up' });
    await submitComposer();

    const threads = storedThreads();
    expect(threads).toHaveLength(1);
    // (150 - 100) / 1 = 50, (120 - 50) / 1 = 70.
    expect(threads[0]).toMatchObject({ x: 50, y: 70, author: 'Matt', text: 'Move this button up' });
  });

  it('the first submit asks for a name and stores it for later composers', async () => {
    render(<Workbench file={BASE_FILE} />);
    await enableCommentMode();
    clickArtboard(150, 120);
    await screen.findByRole('dialog', { name: 'New comment' });

    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    await fillComposer({ name: 'Priya', text: 'Looks great' });
    await submitComposer();

    expect(getAuthorName(window.localStorage)).toBe('Priya');

    await enableCommentMode();
    clickArtboard(200, 180);
    await screen.findByRole('dialog', { name: 'New comment' });
    expect(screen.queryByLabelText('Your name')).toBeNull();
  });

  it('submitting shows a numbered pin and the open-thread badge count', async () => {
    render(<Workbench file={BASE_FILE} />);
    expect(screen.queryByText('1')).toBeNull();

    await addComment({ name: 'Matt', text: 'First comment' });

    const pin = screen.getByRole('button', { name: 'Comment 1' });
    expect(pin).toHaveTextContent('1');
    const commentTool = screen.getByRole('button', { name: 'Comment tool' });
    expect(commentTool).toHaveTextContent('1');
  });

  it('clicking a pin shows the author, a relative time and the text, without needing comment mode', async () => {
    render(<Workbench file={BASE_FILE} />);
    await addComment({ name: 'Matt', text: 'Move this button up' });
    // Comment mode turns itself off after a successful submit.
    expect(screen.getByRole('button', { name: 'Comment tool' })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'Comment 1' }));

    const thread = await screen.findByRole('dialog', { name: 'Comment 1' });
    expect(thread).toHaveTextContent('Matt');
    expect(thread).toHaveTextContent('just now');
    expect(thread).toHaveTextContent('Move this button up');
  });

  it('a reply appears on the thread', async () => {
    render(<Workbench file={BASE_FILE} />);
    await addComment({ name: 'Matt', text: 'Move this button up' });
    await userEvent.click(screen.getByRole('button', { name: 'Comment 1' }));
    await screen.findByRole('dialog', { name: 'Comment 1' });

    await userEvent.type(screen.getByLabelText('Reply'), 'On it');
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(await screen.findByText('On it')).toBeInTheDocument();
    expect(storedThreads()[0]).toMatchObject({
      replies: [expect.objectContaining({ author: 'Matt', text: 'On it' })],
    });
  });

  it('Resolve removes the pin and the thread', async () => {
    render(<Workbench file={BASE_FILE} />);
    await addComment({ name: 'Matt', text: 'Move this button up' });
    await userEvent.click(screen.getByRole('button', { name: 'Comment 1' }));
    await screen.findByRole('dialog', { name: 'Comment 1' });

    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));

    expect(screen.queryByRole('button', { name: 'Comment 1' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Comment 1' })).toBeNull();
    expect(storedThreads()).toHaveLength(0);
  });

  it('Escape exits comment mode and cancels a pending composer without saving it', async () => {
    render(<Workbench file={BASE_FILE} />);
    await enableCommentMode();
    clickArtboard(150, 120);
    const composer = await screen.findByRole('dialog', { name: 'New comment' });
    await userEvent.type(screen.getByLabelText('Add a comment'), 'Never mind');

    fireEvent.keyDown(composer, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'New comment' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Comment tool' })).toHaveAttribute('aria-pressed', 'false');
    expect(storedThreads()).toHaveLength(0);
  });

  it('the Cancel button also discards the pending pin and leaves comment mode', async () => {
    render(<Workbench file={BASE_FILE} />);
    await enableCommentMode();
    clickArtboard(150, 120);
    await screen.findByRole('dialog', { name: 'New comment' });

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'New comment' })).toBeNull();
    expect(storedThreads()).toHaveLength(0);
  });

  it('never calls fetch for any comment interaction', async () => {
    render(<Workbench file={BASE_FILE} />);
    await addComment({ name: 'Matt', text: 'Move this button up' });
    await userEvent.click(screen.getByRole('button', { name: 'Comment 1' }));
    await screen.findByRole('dialog', { name: 'Comment 1' });
    await userEvent.type(screen.getByLabelText('Reply'), 'On it');
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the composer\'s Comment button and the thread\'s Reply button share the SF2 secondary button class', async () => {
    render(<Workbench file={BASE_FILE} />);
    await enableCommentMode();
    clickArtboard(150, 120);
    await screen.findByRole('dialog', { name: 'New comment' });
    expect(screen.getByRole('button', { name: 'Comment' })).toHaveClass(SECONDARY_BUTTON);

    await fillComposer({ name: 'Matt', text: 'Move this button up' });
    await submitComposer();
    await userEvent.click(screen.getByRole('button', { name: 'Comment 1' }));
    await screen.findByRole('dialog', { name: 'Comment 1' });

    expect(screen.getByRole('button', { name: 'Reply' })).toHaveClass(SECONDARY_BUTTON);
  });

  it('clicking the Comment tool button while a pin is pending cancels the pin and closes the composer', async () => {
    render(<Workbench file={BASE_FILE} />);
    await enableCommentMode();
    clickArtboard(150, 120);
    await screen.findByRole('dialog', { name: 'New comment' });

    // Leaving comment mode via the toggle button must do the same cleanup
    // Escape and Cancel already do, not just flip commentMode off.
    await userEvent.click(screen.getByRole('button', { name: 'Comment tool' }));

    expect(screen.queryByRole('dialog', { name: 'New comment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New comment' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Comment tool' })).toHaveAttribute('aria-pressed', 'false');
    expect(storedThreads()).toHaveLength(0);
  });
});
