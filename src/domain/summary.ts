/**
 * Month (or any period) totals from that period's transactions.
 * Rules: docs/MONEY_RULES.md — transfers are never income or spending; refunds reduce spending.
 */
import { assertSafePaise } from '../lib/money';
import type { Transaction } from './types';

type SummaryInput = Pick<Transaction, 'date' | 'type' | 'amount_paise' | 'category_id' | 'recipient_id'>;

export interface Breakdown {
  /** null = uncategorised / no recipient */
  id: string | null;
  amountPaise: number;
}

export interface PeriodSummary {
  incomePaise: number;
  spendingPaise: number;
  savedPaise: number;
  /** Net spending per expense category (expenses − refunds), largest first. Can be negative. */
  spendingByCategory: Breakdown[];
  /** Income per income category, largest first. */
  incomeByCategory: Breakdown[];
  /** Net spending per recipient (expenses − refunds), largest first; recipients with ≤ 0 are left out. */
  spendingByRecipient: Breakdown[];
}

function add(map: Map<string | null, number>, key: string | null, delta: number) {
  map.set(key, (map.get(key) ?? 0) + delta);
}

function sorted(map: Map<string | null, number>): Breakdown[] {
  return [...map.entries()]
    .map(([id, amountPaise]) => ({ id, amountPaise: assertSafePaise(amountPaise) }))
    .sort((a, b) => b.amountPaise - a.amountPaise);
}

export function summarizePeriod(transactions: SummaryInput[], from: string, through: string): PeriodSummary {
  let income = 0;
  let spending = 0;
  const byCategory = new Map<string | null, number>();
  const incomeByCategory = new Map<string | null, number>();
  const byRecipient = new Map<string | null, number>();

  for (const t of transactions) {
    if (t.date < from || t.date > through) continue;
    const amount = assertSafePaise(t.amount_paise);

    switch (t.type) {
      case 'income':
        income += amount;
        add(incomeByCategory, t.category_id, amount);
        break;
      case 'expense':
        spending += amount;
        add(byCategory, t.category_id, amount);
        add(byRecipient, t.recipient_id, amount);
        break;
      case 'refund':
        spending -= amount;
        add(byCategory, t.category_id, -amount);
        add(byRecipient, t.recipient_id, -amount);
        break;
      case 'transfer':
        break;
    }
  }

  return {
    incomePaise: assertSafePaise(income),
    spendingPaise: assertSafePaise(spending),
    savedPaise: assertSafePaise(income - spending),
    spendingByCategory: sorted(byCategory).filter((b) => b.amountPaise !== 0),
    incomeByCategory: sorted(incomeByCategory),
    spendingByRecipient: sorted(byRecipient).filter((b) => b.id !== null && b.amountPaise > 0),
  };
}
