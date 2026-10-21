import { describe, expect, it } from 'vitest';
import { budgetProgress, budgetStatus } from '../domain/budgets';
import { firstDueOnOrAfter, nextMonthlyDue, totalRecurringDue, upcoming } from '../domain/recurring';
import type { Account, RecurringItem } from '../domain/types';

const item = (over: Partial<RecurringItem> = {}): RecurringItem => ({
  id: 'emi',
  name: 'Phone EMI',
  type: 'expense',
  amount_paise: 20000,
  account_id: 'bank',
  to_account_id: null,
  category_id: 'loan',
  day_of_month: 20,
  next_due_date: '2026-10-20',
  instalments_left: null,
  active: true,
  ...over,
});

const card: Account = {
  id: 'card',
  name: 'ICICI',
  type: 'card',
  opening_balance_paise: 0,
  opening_date: '2026-09-30',
  nickname: null,
  card_due_day: 5,
  archived: false,
};

describe('due dates', () => {
  it('moves to the same day next month, clamped to month end', () => {
    expect(nextMonthlyDue('2026-10-20', 20)).toBe('2026-11-20');
    expect(nextMonthlyDue('2026-01-31', 31)).toBe('2026-02-28');
    expect(nextMonthlyDue('2026-02-28', 31)).toBe('2026-03-31');
    expect(nextMonthlyDue('2026-12-05', 5)).toBe('2027-01-05');
  });

  it('finds the first due date from today', () => {
    expect(firstDueOnOrAfter('2026-10-17', 20)).toBe('2026-10-20');
    expect(firstDueOnOrAfter('2026-10-21', 20)).toBe('2026-11-20');
    expect(firstDueOnOrAfter('2026-10-20', 20)).toBe('2026-10-20');
    expect(firstDueOnOrAfter('2026-02-10', 31)).toBe('2026-02-28');
  });
});

describe('upcoming', () => {
  it('lists every unpaid occurrence in the window, not just the next one (90 days → 3 × ₹200)', () => {
    const entries = upcoming([item()], [], '2026-10-17', '2027-01-15');
    expect(entries.map((e) => e.date)).toEqual(['2026-10-20', '2026-11-20', '2026-12-20']);
    expect(totalRecurringDue(entries)).toBe(60000);
    expect(entries.filter((e) => e.kind === 'recurring' && e.isNext)).toHaveLength(1);
  });

  it('a 45-day window holds two occurrences', () => {
    expect(upcoming([item()], [], '2026-10-17', '2026-12-01')).toHaveLength(2);
  });

  it('stops after the last EMI instalment and skips paused items', () => {
    expect(upcoming([item({ instalments_left: 2 })], [], '2026-10-17', '2027-06-30')).toHaveLength(2);
    expect(upcoming([item({ active: false })], [], '2026-10-17', '2027-06-30')).toHaveLength(0);
  });

  it('shows an overdue item at its due date', () => {
    const entries = upcoming([item({ next_due_date: '2026-10-10', day_of_month: 10 })], [], '2026-10-21', '2026-11-05');
    expect(entries.map((e) => e.date)).toEqual(['2026-10-10']);
  });

  it('adds card bill due dates with the current outstanding, and sorts by date', () => {
    const entries = upcoming([item()], [{ account: card, outstandingPaise: 42000 }], '2026-10-17', '2026-11-16');
    expect(entries.map((e) => [e.kind, e.date])).toEqual([
      ['recurring', '2026-10-20'],
      ['card', '2026-11-05'],
    ]);
    expect(totalRecurringDue(entries)).toBe(20000);
  });
});

describe('budgets', () => {
  it('uses ok / near (80%+) / over thresholds', () => {
    expect(budgetStatus(7999, 10000)).toBe('ok');
    expect(budgetStatus(8000, 10000)).toBe('near');
    expect(budgetStatus(10000, 10000)).toBe('near');
    expect(budgetStatus(10001, 10000)).toBe('over');
  });

  it('measures net spending per category and sorts the fullest first', () => {
    const progress = budgetProgress(
      [
        { id: 'b1', category_id: 'food', monthly_limit_paise: 50000 },
        { id: 'b2', category_id: 'groceries', monthly_limit_paise: 60000 },
        { id: 'b3', category_id: 'travel', monthly_limit_paise: 10000 },
      ],
      [
        { id: 'groceries', amountPaise: 70000 },
        { id: 'food', amountPaise: 24000 },
        { id: 'travel', amountPaise: -500 },
      ],
    );
    expect(progress.map((p) => [p.categoryId, p.spentPaise, p.percent, p.status])).toEqual([
      ['groceries', 70000, 116, 'over'],
      ['food', 24000, 48, 'ok'],
      ['travel', 0, 0, 'ok'],
    ]);
  });
});
