import { describe, expect, it } from 'vitest';
import { summarizePeriod } from '../domain/summary';
import { FIXTURE_TRANSACTIONS } from './fixture';

const rows = FIXTURE_TRANSACTIONS.map((t) => ({
  date: t.date,
  type: t.type,
  amount_paise: t.amount_paise,
  category_id: t.category ?? null,
  recipient_id: t.note,
}));

describe('summarizePeriod — reference fixture', () => {
  it('October: income ₹6,000, spending ₹1,140, saved ₹4,860', () => {
    const s = summarizePeriod(rows, '2026-10-01', '2026-10-31');
    expect(s.incomePaise).toBe(600000);
    expect(s.spendingPaise).toBe(114000);
    expect(s.savedPaise).toBe(486000);
  });

  it('5–31 October: income ₹1,000, spending ₹720', () => {
    const s = summarizePeriod(rows, '2026-10-05', '2026-10-31');
    expect(s.incomePaise).toBe(100000);
    expect(s.spendingPaise).toBe(72000);
  });

  it('category totals net refunds and ignore transfers', () => {
    const s = summarizePeriod(rows, '2026-10-01', '2026-10-31');
    const byCat = Object.fromEntries(s.spendingByCategory.map((b) => [b.id, b.amountPaise]));
    expect(byCat).toEqual({
      Groceries: 70000,
      'Food & dining': 24000,
      Health: 12000,
      Transport: 6000,
      'Fees & interest': 2000,
    });
    expect(s.spendingByCategory[0]!.id).toBe('Groceries');
    expect(s.incomeByCategory).toEqual([
      { id: 'Salary', amountPaise: 500000 },
      { id: 'Freelance', amountPaise: 100000 },
    ]);
  });

  it('a refund larger than the month\'s purchases shows as negative', () => {
    const s = summarizePeriod(
      [{ date: '2026-11-02', type: 'refund', amount_paise: 5000, category_id: 'Shopping', recipient_id: 'r' }],
      '2026-11-01',
      '2026-11-30',
    );
    expect(s.spendingPaise).toBe(-5000);
    expect(s.spendingByCategory).toEqual([{ id: 'Shopping', amountPaise: -5000 }]);
    expect(s.spendingByRecipient).toEqual([]);
  });
});
