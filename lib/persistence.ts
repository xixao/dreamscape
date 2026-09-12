import { MAX_STAGE_WIDTH, MIN_STAGE_WIDTH } from './stage';
import { validateLayout } from './files/validate';

export const LAYOUT_STORAGE_KEY = 'assembly-workbench:layout:v1';
export const WIDTH_STORAGE_KEY = 'assembly-workbench:stage-width';

export function saveLayout(json: string, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(LAYOUT_STORAGE_KEY, json);
  } catch (error) {
    console.warn('Could not save the layout.', error);
  }
}

export function loadLayout(
  knownTypes: ReadonlySet<string>,
  storage: Storage = window.localStorage,
): string | null {
  let raw: string | null;
  try {
    raw = storage.getItem(LAYOUT_STORAGE_KEY);
  } catch (error) {
    console.warn('Could not read the saved layout.', error);
    return null;
  }
  if (raw === null) return null;

  const result = validateLayout(raw, knownTypes);
  if (!result.ok) {
    console.warn(`Saved layout ${result.reason}; starting empty.`);
    return null;
  }
  return raw;
}

export function saveStageWidth(width: number, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(WIDTH_STORAGE_KEY, String(width));
  } catch (error) {
    console.warn('Could not save the stage width.', error);
  }
}

export function loadStageWidth(storage: Storage = window.localStorage): number | null {
  try {
    const raw = storage.getItem(WIDTH_STORAGE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < MIN_STAGE_WIDTH || value > MAX_STAGE_WIDTH) return null;
    return Math.round(value);
  } catch (error) {
    console.warn('Could not read the saved stage width.', error);
    return null;
  }
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const run = () => {
    timer = null;
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
    }
  };

  const debounced = (...args: A) => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };

  debounced.flush = () => {
    if (timer) clearTimeout(timer);
    run();
  };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  return debounced;
}
