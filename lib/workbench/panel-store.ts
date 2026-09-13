// Per-browser UI state for the right panel: which tab is active (Design,
// Prototype or Components) and whether the panel is minimized to a rail.
// Neither is part of the file itself, so both live in localStorage the same
// way lib/chat/store.ts's loadChatPanelOpen/saveChatPanelOpen keep the chat
// panel's own open state - not the file's document.
export type PanelMode = 'design' | 'prototype' | 'components';

// Small enough surface that a plain object or the real window.localStorage
// both satisfy it - keeps this module testable without a DOM, matching
// lib/chat/store.ts's ChatStorageLike.
export interface PanelStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PANEL_MODE_KEY = 'assembly-workbench:panel-mode';
const PANEL_COLLAPSED_KEY = 'assembly-workbench:panel-collapsed';

const PANEL_MODES: ReadonlySet<string> = new Set<PanelMode>(['design', 'prototype', 'components']);

export function loadPanelMode(storage: PanelStorageLike): PanelMode {
  try {
    const raw = storage.getItem(PANEL_MODE_KEY);
    return raw !== null && PANEL_MODES.has(raw) ? (raw as PanelMode) : 'design';
  } catch {
    return 'design';
  }
}

export function savePanelMode(storage: PanelStorageLike, mode: PanelMode): void {
  try {
    storage.setItem(PANEL_MODE_KEY, mode);
  } catch {
    // Best effort only - a full or disabled store should not crash the panel.
  }
}

export function loadPanelCollapsed(storage: PanelStorageLike): boolean {
  try {
    return storage.getItem(PANEL_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function savePanelCollapsed(storage: PanelStorageLike, collapsed: boolean): void {
  try {
    storage.setItem(PANEL_COLLAPSED_KEY, collapsed ? 'true' : 'false');
  } catch {
    // Best effort only, matching savePanelMode above.
  }
}
