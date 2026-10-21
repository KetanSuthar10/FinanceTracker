/**
 * Recurring items (bills, EMIs, subscriptions) are reminders, not transactions.
 * See docs/MONEY_RULES.md → "Recurring items".
 */
import { addMonths, daysInMonth } from '../lib/dates';
import type { Account, RecurringItem } from './types';

/** Same day next month, clamped to the month's last day. Mirrors next_monthly_due() in SQL. */
export function nextMonthlyDue(current: string, dayOfMonth: number): string {
  return addMonths(`${current.slice(0, 8)}01`, 1, dayOfMonth);
}

/** The first due date on or after `today` for a given day of the month. */
export function firstDueOnOrAfter(today: string, dayOfMonth: number): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  const thisMonth = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
  return thisMonth >= today ? thisMonth : nextMonthlyDue(thisMonth, dayOfMonth);
}

export interface Occurrence {
  kind: 'recurring';
  item: RecurringItem;
  date: string;
  /** True only for the item's next unpaid occurrence — the one that can be marked as paid. */
  isNext: boolean;
}

export interface CardDue {
  kind: 'card';
  account: Account;
  date: string;
  /** Current outstanding on the card (positive), 0 when nothing is owed. */
  outstandingPaise: number;
}

export type UpcomingEntry = Occurrence | CardDue;

/**
 * Everything due from `from` to `through` (inclusive): every occurrence of each active
 * recurring item (respecting the instalments left) plus each card's bill due day.
 * Overdue items (next due before `from`) are included at their due date.
 */
export function upcoming(
  items: RecurringItem[],
  cards: { account: Account; outstandingPaise: number }[],
  from: string,
  through: string,
): UpcomingEntry[] {
  const out: UpcomingEntry[] = [];

  for (const item of items) {
    if (!item.active) continue;
    let date = item.next_due_date;
    let left = item.instalments_left;
    let first = true;
    while (date <= through && (left === null || left > 0)) {
      if (date >= from || first) out.push({ kind: 'recurring', item, date, isNext: first });
      date = nextMonthlyDue(date, item.day_of_month);
      if (left !== null) left -= 1;
      first = false;
    }
  }

  for (const { account, outstandingPaise } of cards) {
    if (account.archived || account.type !== 'card' || !account.card_due_day) continue;
    let date = firstDueOnOrAfter(from, account.card_due_day);
    while (date <= through) {
      out.push({ kind: 'card', account, date, outstandingPaise });
      date = nextMonthlyDue(date, account.card_due_day);
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Total of recurring amounts due in the window (card reminders excluded — their purchases are already counted). */
export function totalRecurringDue(entries: UpcomingEntry[]): number {
  return entries.reduce((sum, e) => (e.kind === 'recurring' ? sum + e.item.amount_paise : sum), 0);
}
