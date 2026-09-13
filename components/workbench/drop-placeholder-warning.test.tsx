import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EXAMPLES } from '@/lib/examples';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { Workbench } from './workbench';

// Lives in its own file on purpose: React reports "Cannot update a component
// while rendering a different component" once per rendering component per
// module, and workbench.test.tsx already triggers one for another component
// earlier in its run, which would make this assertion pass vacuously there.
// A fresh module (this file) has a clean dedupe table, so a regression in
// drop-placeholder.tsx's subscription path (setting WorkbenchShell state from
// inside Craft's render) fails here for real.

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
// Used only by the "frame positions" tests below, which need a third screen
// and never assert on its rendered content.

// A second page, for the "pages" describe block further down: its own id
// and its own screen, on EXAMPLES[1] (Dashboard) so its content is visibly
// different from PAGE_ID's own screens (a "Save changes" button never
// appears on it, the way it does not on SCREEN_1's Login example either).
const PAGE_2_ID = 'page000002';

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


// Selects the root frame by dispatching the mousedown Craft.js's connectors
// listen for directly on its DOM node (its own `data-block="LayoutBox"`
// element; the login example's only other blocks are Card/Input/Button), then
// flips its "Layout" field from Auto layout to Grid through the Design panel:
// a genuine `setProp` on ROOT driven through the rendered editor, not a bare
// harness call.


const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok('T1')));

beforeEach(() => {
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('drag placeholder and React render warnings', () => {
  it('dragging a tray component over the artboard never updates WorkbenchShell from inside a render', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Workbench file={makeFile()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Elements' }));

    const trayButton = document.querySelector('[data-tray-item="Button"]');
    if (!trayButton) throw new Error('Button tray item not found');
    const root = frameBody().querySelector('[data-block="LayoutBox"]');
    if (!root) throw new Error('root LayoutBox not found');

    const dataTransfer = { setDragImage: () => {}, setData: () => {}, effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(trayButton, { dataTransfer });
    fireEvent.dragOver(root, { clientX: 50, clientY: 50 });
    expect(frameBody().querySelector('[data-drop-placeholder]')).not.toBeNull();
    fireEvent.drop(root);

    const updateWarnings = errorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('Cannot update a component')),
    );
    expect(updateWarnings).toEqual([]);
  });
});
