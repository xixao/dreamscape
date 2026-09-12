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

export type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

export type FilePatch = {
  layout?: string;
  stageWidth?: number;
  name?: string;
};

function mergePatch(a: FilePatch | null, b: FilePatch | null): FilePatch | null {
  if (!a) return b;
  if (!b) return a;
  return { ...a, ...b };
}

export function createFileSaver(options: {
  fileId: string;
  initialUpdatedAt: string;
  delayMs?: number;
  retryMs?: number;
  fetchImpl?: typeof fetch;
  onState?: (state: SaveState, detail?: { updatedAt?: string }) => void;
}): {
  queue(patch: FilePatch): void;
  flush(): Promise<void>;
  getState(): SaveState;
  getUpdatedAt(): string;
  dispose(): void;
} {
  const { fileId, delayMs = 800, retryMs = 5000, onState } = options;

  let currentUpdatedAt = options.initialUpdatedAt;
  let state: SaveState = 'saved';
  let pending: FilePatch | null = null;
  let inFlight = false;
  let inFlightPromise: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function setState(next: SaveState, detail?: { updatedAt?: string }): void {
    state = next;
    if (!onState) return;
    if (detail !== undefined) onState(next, detail);
    else onState(next);
  }

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleAttempt(ms: number): void {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      attemptSend();
    }, ms);
  }

  function attemptSend(): void {
    if (disposed || inFlight || pending === null) return;
    const patch = pending;
    pending = null;
    void sendPatch(patch, false);
  }

  function sendPatch(patch: FilePatch, keepalive: boolean): Promise<void> {
    inFlight = true;
    setState('saving');
    const fetchFn = options.fetchImpl ?? globalThis.fetch;
    const body = JSON.stringify({ ...patch, baseUpdatedAt: currentUpdatedAt });

    const promise = fetchFn(`/api/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive,
    })
      .then(async (response) => {
        inFlight = false;
        inFlightPromise = null;
        if (disposed) return;

        if (response.status === 200) {
          const data = (await response.json()) as { updatedAt: string };
          currentUpdatedAt = data.updatedAt;
          setState('saved', { updatedAt: data.updatedAt });
        } else if (response.status === 409) {
          pending = null;
          setState('conflict');
          return;
        } else if (response.status >= 500) {
          pending = mergePatch(patch, pending);
          setState('error');
          scheduleAttempt(retryMs);
          return;
        } else {
          console.warn(`Could not save the file (status ${response.status}).`);
          setState('error');
          return;
        }

        if (pending !== null) attemptSend();
      })
      .catch(() => {
        inFlight = false;
        inFlightPromise = null;
        if (disposed) return;
        pending = mergePatch(patch, pending);
        setState('error');
        scheduleAttempt(retryMs);
      });

    inFlightPromise = promise;
    return promise;
  }

  return {
    queue(patch: FilePatch): void {
      if (disposed || state === 'conflict') return;
      pending = mergePatch(pending, patch);
      scheduleAttempt(delayMs);
    },
    flush(): Promise<void> {
      if (disposed || state === 'conflict') return Promise.resolve();
      if (inFlight) return inFlightPromise ?? Promise.resolve();
      if (pending === null) return Promise.resolve();
      clearTimer();
      const patch = pending;
      pending = null;
      return sendPatch(patch, true);
    },
    getState(): SaveState {
      return state;
    },
    getUpdatedAt(): string {
      return currentUpdatedAt;
    },
    dispose(): void {
      disposed = true;
      clearTimer();
      pending = null;
    },
  };
}
