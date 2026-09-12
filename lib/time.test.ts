import { describe, expect, it } from 'vitest';
import { relativeTime } from './time';

// Anchored at noon UTC so the calendar date is stable across local timezones
// (this repo's tests run wherever the machine happens to be set).
const NOW = new Date('2026-09-12T12:00:00.000Z').getTime();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function isoBefore(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe('relativeTime', () => {
  it('is "just now" for anything under a minute old', () => {
    expect(relativeTime(isoBefore(0), NOW)).toBe('just now');
    expect(relativeTime(isoBefore(30 * SECOND), NOW)).toBe('just now');
    expect(relativeTime(isoBefore(59 * SECOND + 999), NOW)).toBe('just now');
  });

  it('counts minutes from 1 up to 59, singular at 1', () => {
    expect(relativeTime(isoBefore(MINUTE), NOW)).toBe('1 minute ago');
    expect(relativeTime(isoBefore(5 * MINUTE), NOW)).toBe('5 minutes ago');
    expect(relativeTime(isoBefore(59 * MINUTE + 59 * SECOND), NOW)).toBe('59 minutes ago');
  });

  it('counts hours from 1 up to 23, singular at 1', () => {
    expect(relativeTime(isoBefore(HOUR), NOW)).toBe('1 hour ago');
    expect(relativeTime(isoBefore(3 * HOUR), NOW)).toBe('3 hours ago');
    expect(relativeTime(isoBefore(23 * HOUR + 59 * MINUTE), NOW)).toBe('23 hours ago');
  });

  it('is "yesterday" from 24 up to 48 hours', () => {
    expect(relativeTime(isoBefore(DAY), NOW)).toBe('yesterday');
    expect(relativeTime(isoBefore(30 * HOUR), NOW)).toBe('yesterday');
    expect(relativeTime(isoBefore(2 * DAY - 1), NOW)).toBe('yesterday');
  });

  it('counts days from 2 up to 29', () => {
    expect(relativeTime(isoBefore(2 * DAY), NOW)).toBe('2 days ago');
    expect(relativeTime(isoBefore(3 * DAY), NOW)).toBe('3 days ago');
    expect(relativeTime(isoBefore(29 * DAY), NOW)).toBe('29 days ago');
  });

  it('shows the formatted date beyond 30 days', () => {
    const iso = isoBefore(45 * DAY);
    const expected = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));

    expect(relativeTime(iso, NOW)).toBe(expected);
  });

  it('formats a date 30+ days back as a short month, day and year', () => {
    // NOW itself (2026-09-12, noon UTC) viewed from 40 days later. The day can
    // roll over in far-east time zones, so only the shape and year are pinned.
    const laterNow = NOW + 40 * DAY;
    expect(relativeTime(new Date(NOW).toISOString(), laterNow)).toMatch(/^Sep 1[23], 2026$/);
  });

  it('clamps future timestamps to "just now"', () => {
    expect(relativeTime(new Date(NOW + HOUR).toISOString(), NOW)).toBe('just now');
    expect(relativeTime(new Date(NOW + 45 * DAY).toISOString(), NOW)).toBe('just now');
  });
});
