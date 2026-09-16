import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OVERLAY_TITLE } from './chrome';
import { ShortcutsOverlay } from './shortcuts-overlay';

function mockPlatform(value: string): void {
  Object.defineProperty(window.navigator, 'platform', { value, configurable: true });
}

// vi.advanceTimersByTimeAsync alone can leave a state update made from
// inside the fired timer (setHoldVisible, here) unflushed to the DOM: React's
// scheduler does not always route its own follow-up work through the timers
// vitest is faking. Wrapping the advance in `act` forces React to flush
// before this resolves, the same guarantee `render`/`fireEvent` already give
// for updates made synchronously inside them.
async function advance(ms: number): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

function renderOverlay(open = false) {
  const onOpenChange = vi.fn();
  const utils = render(
    <>
      <input aria-label="typing" />
      <div role="dialog" aria-label="Other dialog">
        <button type="button">Inside dialog</button>
      </div>
      <ShortcutsOverlay open={open} onOpenChange={onOpenChange} />
    </>,
  );
  return { ...utils, onOpenChange };
}

describe('ShortcutsOverlay', () => {
  beforeEach(() => {
    mockPlatform('MacIntel');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing initially', () => {
    renderOverlay();
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
  });

  describe('holding the modifier key', () => {
    it('never shows anything: the top bar\'s ⌘ button and "?" open the dialog instead', async () => {
      vi.useFakeTimers();
      renderOverlay();
      fireEvent.keyDown(window, { key: 'Meta' });
      await advance(1000);
      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
      fireEvent.keyDown(window, { key: 'Control' });
      await advance(1000);
      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    });
  });

  describe('platform detection', () => {
    it('formats key caps with Ctrl on a non-mac platform', () => {
      mockPlatform('Win32');
      renderOverlay(true);
      expect(screen.getByText('Ctrl+R')).toBeInTheDocument();
    });

    it('formats key caps with ⌘ on a mac platform', () => {
      renderOverlay(true);
      expect(screen.getByText('⌘R')).toBeInTheDocument();
    });
  });

  describe('as a dialog (open prop)', () => {
    it('renders the same content, grouped by area with mono key caps, when open is true', () => {
      renderOverlay(true);

      const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
      expect(within(dialog).getByText('Design tab')).toBeInTheDocument();
      expect(within(dialog).getByText('D')).toBeInTheDocument();
      expect(within(dialog).getByText('Present the focused screen')).toBeInTheDocument();
      expect(within(dialog).getByText('⌘R')).toBeInTheDocument();
      expect(within(dialog).getAllByText('Pan the canvas')).toHaveLength(1);
      expect(within(dialog).getByText('Hold Space + drag')).toBeInTheDocument();
      expect(within(dialog).getByText('Middle mouse drag')).toBeInTheDocument();
    });

    it('filters the reference by action and provides a clear empty state', () => {
      renderOverlay(true);
      fireEvent.change(screen.getByLabelText('Search shortcuts'), { target: { value: 'component' } });
      expect(screen.getByText('Create Custom Component')).toBeInTheDocument();
      expect(screen.queryByText('Design tab')).toBeNull();
      fireEvent.change(screen.getByLabelText('Search shortcuts'), { target: { value: 'no-such-action' } });
      expect(screen.getByRole('status')).toHaveTextContent('No shortcuts found');
    });

    it('sets its title in OVERLAY_TITLE, the same treatment as the Component documentation dialog', () => {
      renderOverlay(true);
      const title = screen.getByRole('heading', { name: 'Keyboard shortcuts' });
      expect(title.className.split(/\s+/)).toEqual(expect.arrayContaining(OVERLAY_TITLE.split(' ')));
    });

    it('renders nothing else when open is false', () => {
      renderOverlay(false);
      expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
    });

    it('Escape closes it through onOpenChange', async () => {
      const { onOpenChange } = renderOverlay(true);
      const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });

      fireEvent.keyDown(dialog, { key: 'Escape' });

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });
  });
});
