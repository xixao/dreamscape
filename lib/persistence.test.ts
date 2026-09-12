import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Screen } from './files/repository';
import { createFileSaver } from './persistence';

function screen(id: string, overrides: Partial<Screen> = {}): Screen {
  return { id, name: 'Frame 1', layout: '{}', stageWidth: 1440, ...overrides };
}

const SCREENS_A: Screen[] = [screen('s1')];
const SCREENS_B: Screen[] = [screen('s1'), screen('s2', { name: 'Frame 2' })];

describe('createFileSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function ok(updatedAt: string): Response {
    return new Response(JSON.stringify({ updatedAt }), { status: 200 });
  }

  function conflict(updatedAt: string): Response {
    return new Response(JSON.stringify({ updatedAt }), { status: 409 });
  }

  it('merges two queued patches (different fields) into one PATCH with baseUpdatedAt, then sends the adopted updatedAt as the next baseUpdatedAt', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(ok('T1'));
    fetchMock.mockResolvedValueOnce(ok('T2'));
    const saver = createFileSaver({
      fileId: 'abc123',
      initialUpdatedAt: 'T0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    saver.queue({ screens: SCREENS_A });
    saver.queue({ name: 'Renamed' });
    await vi.advanceTimersByTimeAsync(800);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/files/abc123');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.keepalive).toBe(false);
    expect(JSON.parse(init.body)).toEqual({ screens: SCREENS_A, name: 'Renamed', baseUpdatedAt: 'T0' });
    expect(saver.getUpdatedAt()).toBe('T1');

    saver.queue({ screens: SCREENS_B });
    await vi.advanceTimersByTimeAsync(800);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      screens: SCREENS_B,
      baseUpdatedAt: 'T1',
    });
  });

  it('reports state transitions saved, saving, saved through onState', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('T1'));
    const onState = vi.fn();
    const saver = createFileSaver({
      fileId: 'abc123',
      initialUpdatedAt: 'T0',
      fetchImpl: fetchMock as unknown as typeof fetch,
      onState,
    });

    expect(saver.getState()).toBe('saved');
    expect(onState).not.toHaveBeenCalled();

    saver.queue({ name: 'x' });
    await vi.advanceTimersByTimeAsync(800);

    expect(onState.mock.calls).toEqual([['saving'], ['saved', { updatedAt: 'T1' }]]);
    expect(saver.getState()).toBe('saved');
  });

  it('enters conflict on 409, adopts nothing, and ignores later queue and flush calls', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(conflict('Tserver'));
    const saver = createFileSaver({
      fileId: 'abc123',
      initialUpdatedAt: 'T0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    saver.queue({ screens: SCREENS_A });
    await vi.advanceTimersByTimeAsync(800);

    expect(saver.getState()).toBe('conflict');
    expect(saver.getUpdatedAt()).toBe('T0');

    saver.queue({ screens: SCREENS_B });
    await vi.runAllTimersAsync();
    await saver.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries after a thrown network error and then saves', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(ok('T1'));
    const saver = createFileSaver({
      fileId: 'abc123',
      initialUpdatedAt: 'T0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    saver.queue({ screens: SCREENS_A });
    await vi.advanceTimersByTimeAsync(800);

    expect(saver.getState()).toBe('error');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      screens: SCREENS_A,
      baseUpdatedAt: 'T0',
    });
    expect(saver.getState()).toBe('saved');
  });

  it('sets error without retrying on a 400, and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'bad' }), { status: 400 }));
    const saver = createFileSaver({
      fileId: 'abc123',
      initialUpdatedAt: 'T0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    saver.queue({ screens: SCREENS_A });
    await vi.advanceTimersByTimeAsync(800);

    expect(saver.getState()).toBe('error');
    expect(warn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it('flush sends immediately with keepalive true and resolves after the response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('T1'));
    const saver = createFileSaver({
      fileId: 'abc123',
      initialUpdatedAt: 'T0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    saver.queue({ screens: SCREENS_A });
    await saver.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
    expect(saver.getState()).toBe('saved');
    expect(saver.getUpdatedAt()).toBe('T1');

    await saver.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flush waits for an in-flight send instead of starting a second one', async () => {
    let resolveFirst!: (value: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.fn().mockImplementationOnce(() => firstResponse);
    const saver = createFileSaver({
      fileId: 'abc123',
      initialUpdatedAt: 'T0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    saver.queue({ screens: SCREENS_A });
    await vi.advanceTimersByTimeAsync(800);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const flushPromise = saver.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFirst(ok('T1'));
    await flushPromise;

    expect(saver.getState()).toBe('saved');
    expect(saver.getUpdatedAt()).toBe('T1');
  });

  it('dispose cancels a pending timer so no send happens', async () => {
    const fetchMock = vi.fn();
    const saver = createFileSaver({
      fileId: 'abc123',
      initialUpdatedAt: 'T0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    saver.queue({ screens: SCREENS_A });
    saver.dispose();
    await vi.runAllTimersAsync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queues during an in-flight send and sends a second PATCH after the first resolves', async () => {
    let resolveFirst!: (value: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce(ok('T2'));
    const saver = createFileSaver({
      fileId: 'abc123',
      initialUpdatedAt: 'T0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    saver.queue({ screens: SCREENS_A });
    await vi.advanceTimersByTimeAsync(800);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saver.getState()).toBe('saving');

    saver.queue({ screens: SCREENS_B });
    resolveFirst(ok('T1'));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      screens: SCREENS_B,
      baseUpdatedAt: 'T1',
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(saver.getState()).toBe('saved');
    expect(saver.getUpdatedAt()).toBe('T2');
  });
});
