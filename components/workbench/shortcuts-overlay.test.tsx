import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WIDE_DIALOG_CONTENT } from './chrome';
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

    it('widens the dialog past the shadcn default max-width at sm and above', () => {
      renderOverlay(true);
      const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });

      // shadcn's own DialogContent hardcodes `sm:max-w-sm`, which wins over
      // a plain `max-w-[880px]` override at any viewport >= 640px (same
      // "sm:" variant scope, later in the cascade) - only a same-variant
      // override actually takes effect. See components/ui/dialog.tsx
      // (read-only) for the base classes this must out-rank.
      expect(dialog.className.split(/\s+/)).toContain('sm:max-w-[calc(100vw-48px)]');
      expect(dialog.className.split(/\s+/)).toContain('xl:max-w-[1800px]');
      // The width classes come from the one WIDE_DIALOG_CONTENT constant the
      // Element documentation dialog shares (spec docs/superpowers/specs/
      // 2026-09-13-element-docs-design.md section 1), so the two dialogs
      // cannot drift apart in size.
      for (const widthClass of WIDE_DIALOG_CONTENT.split(' ')) {
        expect(dialog.className.split(/\s+/)).toContain(widthClass);
      }
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
