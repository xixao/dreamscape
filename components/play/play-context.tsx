'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type PlayMode = 'design' | 'play';

export interface PlayContextValue {
  mode: PlayMode;
  /** Runs a `navigate` interaction: swaps the current screen for `screenId`. */
  navigate: (screenId: string) => void;
  /** Runs a `back` interaction: returns to the previously visited screen. */
  back: () => void;
  /** Runs an `openDialog` interaction, or a Dialog block's own trigger. */
  openDialog: (nodeId: string) => void;
  /** Closes a Dialog block's real shadcn Dialog (its own close button, overlay click, or Escape). */
  closeDialog: (nodeId: string) => void;
  /** Whether the Dialog block with this node id is currently open. */
  isDialogOpen: (nodeId: string) => boolean;
  /**
   * Runs an `openOverlay` interaction: opens the overlay frame with this
   * screen id on top of the current screen (spec docs/superpowers/specs/
   * 2026-09-13-overlay-frames-design.md sections 3 and 4).
   */
  openOverlay: (screenId: string) => void;
  /**
   * Runs a `closeOverlay` interaction: closes the top overlay - inside an
   * overlay's own layout, the overlay it lives in (see
   * components/play/player.tsx's OverlayHost).
   */
  closeOverlay: () => void;
}

const noop = () => {};

// Defaults to design mode with no-op functions (rather than throwing when
// there is no provider), so every block can call usePlay() unconditionally
// and every existing test/editor render - none of which wrap anything in a
// PlayProvider - keeps behaving exactly as it did before Play mode existed.
// Only components/play/player.tsx ever mounts a real PlayProvider.
const DEFAULT_VALUE: PlayContextValue = {
  mode: 'design',
  navigate: noop,
  back: noop,
  openDialog: noop,
  closeDialog: noop,
  isDialogOpen: () => false,
  openOverlay: noop,
  closeOverlay: noop,
};

const PlayContext = createContext<PlayContextValue>(DEFAULT_VALUE);

export function PlayProvider({ value, children }: { value: PlayContextValue; children: ReactNode }) {
  return <PlayContext.Provider value={value}>{children}</PlayContext.Provider>;
}

export function usePlay(): PlayContextValue {
  return useContext(PlayContext);
}
