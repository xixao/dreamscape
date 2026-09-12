import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LAYOUT_STORAGE_KEY,
  WIDTH_STORAGE_KEY,
  debounce,
  loadLayout,
  loadStageWidth,
  saveLayout,
  saveStageWidth,
} from './persistence';

const KNOWN = new Set(['LayoutBox', 'Button']);
const GOOD = JSON.stringify({
  ROOT: { type: { resolvedName: 'LayoutBox' }, nodes: ['b1'], parent: null },
  b1: { type: { resolvedName: 'Button' }, nodes: [], parent: 'ROOT' },
});

describe('layout persistence', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    localStorage.clear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('round-trips a valid layout', () => {
    saveLayout(GOOD);
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe(GOOD);
    expect(loadLayout(KNOWN)).toBe(GOOD);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns null when nothing is saved, without warning', () => {
    expect(loadLayout(KNOWN)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects corrupt JSON with a warning', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, '{not json');
    expect(loadLayout(KNOWN)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects a layout with no ROOT', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ x: {} }));
    expect(loadLayout(KNOWN)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects a layout that names an unknown block', () => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ ROOT: { type: { resolvedName: 'Carousel' }, nodes: [], parent: null } }),
    );
    expect(loadLayout(KNOWN)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Carousel'));
  });
});

describe('stage width persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips and rounds', () => {
    saveStageWidth(1023.6);
    expect(localStorage.getItem(WIDTH_STORAGE_KEY)).toBe('1023.6');
    expect(loadStageWidth()).toBe(1024);
  });

  it('rejects missing, non-numeric and out-of-range values', () => {
    expect(loadStageWidth()).toBeNull();
    localStorage.setItem(WIDTH_STORAGE_KEY, 'wide');
    expect(loadStageWidth()).toBeNull();
    localStorage.setItem(WIDTH_STORAGE_KEY, '10');
    expect(loadStageWidth()).toBeNull();
    localStorage.setItem(WIDTH_STORAGE_KEY, '5000');
    expect(loadStageWidth()).toBeNull();
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls once with the last arguments after the delay, and flush runs it now', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500);
    debounced('a');
    debounced('b');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');

    debounced('c');
    debounced.flush();
    expect(fn).toHaveBeenLastCalledWith('c');
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(2);

    debounced('d');
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
