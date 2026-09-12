import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LAYOUT_STORAGE_KEY, WIDTH_STORAGE_KEY } from '@/lib/persistence';
import { Workbench } from './workbench';

// The stage-width ToggleGroupItem buttons are `role="radio"` (a single-select
// ToggleGroup is a radiogroup), not `role="button"`; matched by visible text
// instead, same as components/workbench/topbar.test.tsx's own presetButton().
function presetButton(label: string) {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`no button for ${label}`);
  return button;
}

const SAVED = JSON.stringify({
  ROOT: {
    type: { resolvedName: 'LayoutBox' },
    isCanvas: true,
    props: { mode: 'flex', direction: { mobile: 'column', desktop: 'column' }, columns: { mobile: 1, desktop: 3 }, align: { mobile: 'stretch', desktop: 'stretch' }, justify: { mobile: 'start', desktop: 'start' }, gap: 4, padding: 6, background: 'none', grow: false },
    displayName: 'LayoutBox',
    custom: {},
    hidden: false,
    nodes: ['btn1'],
    linkedNodes: {},
    parent: null,
  },
  btn1: {
    type: { resolvedName: 'Button' },
    isCanvas: false,
    props: { label: 'Restored', variant: 'default', size: 'default', disabled: false, grow: false },
    displayName: 'Button',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
});

// Passes loadLayout's shallow validation (ROOT exists and every top-level node's
// type is a known block) but ROOT claims a child, "missing", that has no entry of
// its own. Craft.js's DefaultRender throws (TypeError: Cannot read properties of
// undefined (reading 'children')) trying to render that child, which loadLayout's
// own checks cannot see since they never walk into `nodes` arrays: confirmed by
// probing this exact JSON against a real render before writing StageErrorBoundary.
const DANGLING_CHILD = JSON.stringify({
  ROOT: {
    type: { resolvedName: 'LayoutBox' },
    isCanvas: true,
    props: { mode: 'flex', direction: { mobile: 'column', desktop: 'column' }, columns: { mobile: 1, desktop: 3 }, align: { mobile: 'stretch', desktop: 'stretch' }, justify: { mobile: 'start', desktop: 'start' }, gap: 4, padding: 6, background: 'none', grow: false },
    displayName: 'LayoutBox',
    custom: {},
    hidden: false,
    nodes: ['missing'],
    linkedNodes: {},
    parent: null,
  },
});

describe('Workbench persistence', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('shows an empty stage and clears storage when the saved layout throws while rendering', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(LAYOUT_STORAGE_KEY, DANGLING_CHILD);
    render(<Workbench />);
    expect(await screen.findByText('Nothing on the stage yet')).toBeInTheDocument();
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      'Saved layout could not be loaded; starting empty.',
      expect.anything(),
    );
  });

  it('restores the saved layout and width', async () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, SAVED);
    localStorage.setItem(WIDTH_STORAGE_KEY, '768');
    render(<Workbench />);
    expect(await screen.findByRole('button', { name: 'Restored' })).toBeInTheDocument();
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('768 px · desktop');
  });

  it('starts empty when the saved layout is unusable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(LAYOUT_STORAGE_KEY, '{');
    render(<Workbench />);
    expect(await screen.findByText('Nothing on the stage yet')).toBeInTheDocument();
  });

  it('saves after a change and clears the stage through New', async () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, SAVED);
    render(<Workbench />);
    await screen.findByRole('button', { name: 'Restored' });

    await userEvent.click(screen.getByRole('button', { name: 'New layout' }));
    expect(await screen.findByText('Start a new layout?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Start a new layout?')).toBeNull());
    expect(screen.getByRole('button', { name: 'Restored' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New layout' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Clear stage' }));
    expect(await screen.findByText('Nothing on the stage yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await waitFor(
      () => expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).not.toContain('Restored'),
      { timeout: 1500 },
    );
  });

  it('debounces the stage width save, coalescing rapid changes into one write', async () => {
    render(<Workbench />);
    await screen.findByText('Nothing on the stage yet');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const widthWrites = () => setItemSpy.mock.calls.filter(([key]) => key === WIDTH_STORAGE_KEY);

    await userEvent.click(presetButton('Tablet'));
    await userEvent.click(presetButton('Mobile'));
    expect(widthWrites()).toHaveLength(0);

    await waitFor(() => expect(widthWrites()).toHaveLength(1), { timeout: 1500 });
    expect(widthWrites()[0]).toEqual([WIDTH_STORAGE_KEY, '375']);
  });

  it('flushes the debounced width save on unmount', async () => {
    const { unmount } = render(<Workbench />);
    await screen.findByText('Nothing on the stage yet');
    await userEvent.click(presetButton('Mobile'));
    expect(localStorage.getItem(WIDTH_STORAGE_KEY)).toBeNull();
    unmount();
    expect(localStorage.getItem(WIDTH_STORAGE_KEY)).toBe('375');
  });
});
