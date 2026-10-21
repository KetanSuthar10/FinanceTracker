/**
 * Account balances — the formula from docs/MONEY_RULES.md.
 * The database only returns summed effects per account (account_totals);
 * the rule for combining them lives here so it is unit tested.
 */
import { assertSafePaise } from '../lib/money';
import type { AccountType } from './types';

export interface AccountTotals {
  account_id: string;
  income_in_paise: number;
  refund_in_paise: number;
  expense_out_paise: number;
  transfer_in_paise: number;
  transfer_out_paise: number;
}

export interface AccountForBalance {
  id: string;
  type: AccountType;
  opening_balance_paise: number;
}

const ZERO_TOTALS: Omit<AccountTotals, 'account_id'> = {
  income_in_paise: 0,
  refund_in_paise: 0,
  expense_out_paise: 0,
  transfer_in_paise: 0,
  transfer_out_paise: 0,
};

/** balance = opening + income in + refunds in + transfers in − expenses out − transfers out */
export function computeBalance(openingPaise: number, totals?: Omit<AccountTotals, 'account_id'>): number {
  const t = totals ?? ZERO_TOTALS;
  const balance =
    assertSafePaise(openingPaise, 'opening balance') +
    assertSafePaise(t.income_in_paise) +
    assertSafePaise(t.refund_in_paise) +
    assertSafePaise(t.transfer_in_paise) -
    assertSafePaise(t.expense_out_paise) -
    assertSafePaise(t.transfer_out_paise);
  return assertSafePaise(balance, 'balance');
}

export interface Positions {
  balances: Map<string, number>;
  /** Bank + cash. Credit limits never count. */
  moneyInHandPaise: number;
  /** Total owed on cards, shown as a positive number. */
  cardOutstandingPaise: number;
  /** All balances added up; card debt counts as negative. */
  netPositionPaise: number;
}

export function computePositions(accounts: AccountForBalance[], totals: AccountTotals[]): Positions {
  const totalsById = new Map(totals.map((t) => [t.account_id, t]));
  const balances = new Map<string, number>();
  let moneyInHandPaise = 0;
  let cardOutstandingPaise = 0;
  let netPositionPaise = 0;

  for (const account of accounts) {
    const balance = computeBalance(account.opening_balance_paise, totalsById.get(account.id));
    balances.set(account.id, balance);
    netPositionPaise += balance;
    if (account.type === 'card') {
      if (balance < 0) cardOutstandingPaise += -balance;
    } else {
      moneyInHandPaise += balance;
    }
  }

  return {
    balances,
    moneyInHandPaise: assertSafePaise(moneyInHandPaise),
    cardOutstandingPaise: assertSafePaise(cardOutstandingPaise),
    netPositionPaise: assertSafePaise(netPositionPaise),
  };
}
