import { MAX_ZOOM, MIN_ZOOM, type Viewport } from './viewport';

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
  if (typeof x !== 'number' || typeof y !== 'number' || typeof zoom !== 'number') return false;
  // JSON has no NaN/Infinity literal (JSON.parse already throws on one,
  // caught below), but a huge exponent - a syntactically ordinary JSON
  // number - overflows a JS double into Infinity on parse, and corrupt or
  // hand-edited storage could plausibly carry one. A canvas transform built
  // from a non-finite or wildly out-of-range zoom would paint nothing
  // (scale(Infinity)) or something practically unusable, so this is treated
  // the same as any other corrupt value: fall back to null, and let the
  // caller compute a fresh default (fit all) instead.
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return false;
  return zoom >= MIN_ZOOM && zoom <= MAX_ZOOM;
}

/**
 * The saved viewport `{ x, y, zoom }` for this page of this file in this
 * browser, or null when nothing is stored yet, the value is corrupt JSON,
 * or it does not have the shape of a Viewport - every failure mode falls
 * back to null rather than throwing, so a caller can always treat null as
 * "compute a default (fit all) instead." Keyed per page (migration 0003),
 * not just per file: each page is its own infinite canvas with its own pan
 * and zoom, so switching pages must not carry one page's viewport onto
 * another's frames.
 */
export function loadViewport(storage: ViewportStorageLike, fileId: string, pageId: string): Viewport | null {
  try {
    const raw = storage.getItem(KEY_PREFIX + fileId + ':' + pageId);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isViewport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveViewport(storage: ViewportStorageLike, fileId: string, pageId: string, viewport: Viewport): void {
  try {
    storage.setItem(KEY_PREFIX + fileId + ':' + pageId, JSON.stringify(viewport));
  } catch {
    // Best effort only - a full or disabled store should not crash the
    // canvas, matching lib/workbench/panel-store.ts's savePanelMode.
  }
}
