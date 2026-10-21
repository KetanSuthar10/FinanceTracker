/**
 * Calendar dates are plain 'YYYY-MM-DD' strings in Asia/Kolkata.
 * Never use `new Date().toISOString()` for "today" — that is UTC.
 */

export const APP_TIME_ZONE = 'Asia/Kolkata';

const isoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in India as 'YYYY-MM-DD'. */
export function todayIST(now: Date = new Date()): string {
  return isoDateFormatter.format(now);
}

/** True only for real calendar dates like '2026-02-28' (rejects '2026-02-31'). */
export function isValidISODate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseISO(value: string): Date {
  if (!isValidISODate(value)) throw new Error(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00Z`);
}

/** Adds (or subtracts) whole days to a 'YYYY-MM-DD' date. */
export function addDays(value: string, days: number): string {
  const date = parseISO(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

/** Number of days in a month (month is 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** First and last day of the month containing `value`. */
export function monthRange(value: string): { from: string; through: string } {
  const date = parseISO(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    through: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}`,
  };
}

/** Moves a 'YYYY-MM-DD' date by whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(value: string, months: number, preferredDay?: number): string {
  const date = parseISO(value);
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(preferredDay ?? date.getUTCDate(), daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const monthLabelFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** '2026-10-21' -> 'October 2026' */
export function formatMonthLabel(value: string): string {
  return monthLabelFormatter.format(parseISO(value));
}

const dayLabelFormatter = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** '2026-10-21' -> 'Today' / 'Yesterday' / 'Mon, 19 Oct' */
export function formatDayLabel(value: string, today: string = todayIST()): string {
  if (value === today) return 'Today';
  if (value === addDays(today, -1)) return 'Yesterday';
  return dayLabelFormatter.format(parseISO(value));
}

const shortDateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** '2026-10-21' -> '21 Oct 2026' */
export function formatShortDate(value: string): string {
  return shortDateFormatter.format(parseISO(value));
}

/** 'YYYY-MM' for the month containing the date. */
export function monthKey(value: string): string {
  return value.slice(0, 7);
}

/** True for 'YYYY-MM' strings with a real month. */
export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
