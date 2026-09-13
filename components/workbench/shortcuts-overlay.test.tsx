import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    it('shows the overlay, grouped by area, after 600ms', async () => {
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(window, { key: 'Meta' });
      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();

      await advance(600);

      expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
      expect(screen.getByText('Panels')).toBeInTheDocument();
      expect(screen.getByText('Design tab')).toBeInTheDocument();
      expect(screen.getByText('D')).toBeInTheDocument();
      expect(screen.getByText('Present the focused screen')).toBeInTheDocument();
      expect(screen.getByText('⌘R')).toBeInTheDocument();
    });

    it('does not show before 600ms', async () => {
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(window, { key: 'Meta' });
      await advance(500);

      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    });

    it('cancels the pending hold when another key is pressed, so a combo never shows it', async () => {
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(window, { key: 'Meta' });
      await advance(300);
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
      await advance(600);

      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    });

    it('a shortcut fired during the hold still runs (this overlay never calls preventDefault)', () => {
      renderOverlay();
      const notCancelled = fireEvent.keyDown(window, { key: 'z', metaKey: true });

      expect(notCancelled).toBe(true);
    });

    it('hides on keyup of the modifier', async () => {
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(window, { key: 'Meta' });
      await advance(600);
      expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();

      fireEvent.keyUp(window, { key: 'Meta' });
      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    });

    it('cancels a still-pending hold on keyup, before it ever shows', async () => {
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(window, { key: 'Meta' });
      await advance(300);
      fireEvent.keyUp(window, { key: 'Meta' });
      await advance(600);

      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    });

    it('hides on window blur', async () => {
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(window, { key: 'Meta' });
      await advance(600);
      expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();

      fireEvent.blur(window);
      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    });

    it('hides on Escape', async () => {
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(window, { key: 'Meta' });
      await advance(600);
      expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    });

    it('never opens while a text field has focus', async () => {
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'Meta' });
      await advance(600);

      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    });

    it('never opens while a dialog or menu owns the interaction', async () => {
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(screen.getByRole('button', { name: 'Inside dialog' }), { key: 'Meta' });
      await advance(600);

      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    });

    it('is display-only: the scrim has pointer-events-none', async () => {
      vi.useFakeTimers();
      const { container } = renderOverlay();

      fireEvent.keyDown(window, { key: 'Meta' });
      await advance(600);

      expect(container.querySelector('.pointer-events-none')).not.toBeNull();
    });
  });

  describe('platform detection', () => {
    it('watches Control (not Meta) and shows the Ctrl caption on a non-mac platform', async () => {
      mockPlatform('Win32');
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(window, { key: 'Meta' });
      await advance(600);
      expect(screen.queryByText('Keyboard shortcuts')).toBeNull();

      fireEvent.keyDown(window, { key: 'Control' });
      await advance(600);

      expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
      expect(screen.getByText('Release Ctrl to close')).toBeInTheDocument();
      expect(screen.getByText('Ctrl+R')).toBeInTheDocument();
    });

    it('shows the Release Cmd caption on a mac platform', async () => {
      vi.useFakeTimers();
      renderOverlay();

      fireEvent.keyDown(window, { key: 'Meta' });
      await advance(600);

      expect(screen.getByText('Release ⌘ to close')).toBeInTheDocument();
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
