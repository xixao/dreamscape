import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLACEHOLDER_REPLY_DELAY_MS, PLACEHOLDER_REPLY_TEXT, placeholderTransport } from './transport';

describe('placeholderTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resolves with the fixed placeholder text after 600ms', async () => {
    const promise = placeholderTransport.send([], 'Hello');
    vi.advanceTimersByTime(PLACEHOLDER_REPLY_DELAY_MS);
    await expect(promise).resolves.toBe(PLACEHOLDER_REPLY_TEXT);
    expect(PLACEHOLDER_REPLY_DELAY_MS).toBe(600);
  });

  it('does not resolve before the delay has fully elapsed', async () => {
    let resolved = false;
    const promise = placeholderTransport.send([], 'Hello').then(() => {
      resolved = true;
    });

    vi.advanceTimersByTime(PLACEHOLDER_REPLY_DELAY_MS - 50);
    await Promise.resolve();
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(50);
    await promise;
    expect(resolved).toBe(true);
  });

  it('ignores the conversation history and input text (always the same fixed reply)', async () => {
    const promise = placeholderTransport.send(
      [{ id: '1', role: 'user', text: 'earlier message', createdAt: '2026-01-01T00:00:00.000Z' }],
      'anything at all',
    );
    vi.advanceTimersByTime(PLACEHOLDER_REPLY_DELAY_MS);
    await expect(promise).resolves.toBe(PLACEHOLDER_REPLY_TEXT);
  });

  it('never calls fetch or any other network API', async () => {
    const promise = placeholderTransport.send([], 'Hello');
    vi.advanceTimersByTime(PLACEHOLDER_REPLY_DELAY_MS);
    await promise;
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects when the signal is already aborted or aborts before the delay elapses', async () => {
    const controller = new AbortController();
    const promise = placeholderTransport.send([], 'Hello', controller.signal);
    const assertion = expect(promise).rejects.toThrow();
    controller.abort();
    await assertion;
  });
});
