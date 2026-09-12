import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LAYOUT_STORAGE_KEY, WIDTH_STORAGE_KEY } from '@/lib/persistence';
import { Workbench } from './workbench';

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

describe('Workbench persistence', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

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
});
