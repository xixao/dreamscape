const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;

const ABSOLUTE_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

/**
 * Formats an ISO timestamp relative to `now`: "just now" under a minute,
 * then minutes, hours, "yesterday" for 24 to 48 hours, then days up to 30
 * days, then an absolute "Sep 12, 2026" style date. Future timestamps (a
 * clock skew, or a row written a moment after the page loaded) clamp to
 * "just now" rather than showing a negative duration.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, now - then);

  if (diffMs < MINUTE_MS) return 'just now';

  if (diffMs < HOUR_MS) {
    return plural(Math.floor(diffMs / MINUTE_MS), 'minute');
  }

  if (diffMs < DAY_MS) {
    return plural(Math.floor(diffMs / HOUR_MS), 'hour');
  }

  if (diffMs < 2 * DAY_MS) {
    return 'yesterday';
  }

  if (diffMs < MONTH_MS) {
    return plural(Math.floor(diffMs / DAY_MS), 'day');
  }

  return ABSOLUTE_DATE_FORMAT.format(new Date(then));
}
