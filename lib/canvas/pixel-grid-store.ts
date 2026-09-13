// Per-browser visibility of the canvas's own pixel (dot) grid (spec docs/
// superpowers/specs/2026-09-13-grid-snapping-alignment-design.md section 5),
// toggled by Cmd+' - not part of any file, so it lives in localStorage the
// same way lib/workbench/panel-store.ts's loadPanelCollapsed/
// savePanelCollapsed keep the right panel's own minimized state.

// Small enough surface that a plain object or the real window.localStorage
// both satisfy it - keeps this module testable without a DOM, matching
// lib/workbench/panel-store.ts's PanelStorageLike.
export interface PixelGridStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PIXEL_GRID_KEY = 'assembly-workbench:pixel-grid';

// Defaults to visible (true): the canvas's dot grid has always been shown
// unconditionally until this toggle existed, so a browser with nothing
// stored yet keeps seeing exactly what it always has.
export function loadPixelGridVisible(storage: PixelGridStorageLike): boolean {
  try {
    const raw = storage.getItem(PIXEL_GRID_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function savePixelGridVisible(storage: PixelGridStorageLike, visible: boolean): void {
  try {
    storage.setItem(PIXEL_GRID_KEY, visible ? 'true' : 'false');
  } catch {
    // Best effort only, matching lib/workbench/panel-store.ts.
  }
}
