import type { Viewport } from './viewport';

// Small enough surface that a plain object or the real window.localStorage
// both satisfy it - the same pattern lib/chat/store.ts's ChatStorageLike and
// lib/workbench/panel-store.ts's PanelStorageLike already use, kept
// consistent here rather than importing either of those (neither is about
// viewport state, and this module has no other reason to depend on them).
export interface ViewportStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY_PREFIX = 'assembly-workbench:viewport:';

function isViewport(value: unknown): value is Viewport {
  if (typeof value !== 'object' || value === null) return false;
  const { x, y, zoom } = value as Record<string, unknown>;
  return typeof x === 'number' && typeof y === 'number' && typeof zoom === 'number';
}

/**
 * The saved viewport `{ x, y, zoom }` for this file in this browser, or null
 * when nothing is stored yet, the value is corrupt JSON, or it does not have
 * the shape of a Viewport - every failure mode falls back to null rather
 * than throwing, so a caller can always treat null as "compute a default
 * (fit all) instead."
 */
export function loadViewport(storage: ViewportStorageLike, fileId: string): Viewport | null {
  try {
    const raw = storage.getItem(KEY_PREFIX + fileId);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isViewport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveViewport(storage: ViewportStorageLike, fileId: string, viewport: Viewport): void {
  try {
    storage.setItem(KEY_PREFIX + fileId, JSON.stringify(viewport));
  } catch {
    // Best effort only - a full or disabled store should not crash the
    // canvas, matching lib/workbench/panel-store.ts's savePanelMode.
  }
}
