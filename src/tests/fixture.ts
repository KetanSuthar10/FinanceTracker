/**
 * Reference fixture from docs/MONEY_RULES.md. Amounts in paise.
 * Expected results are written out by hand in the tests — never computed by the code under test.
 */
export const FIXTURE_ACCOUNTS = [
  { key: 'bankA', name: 'Bank A', type: 'bank', opening_balance_paise: 100000 },
  { key: 'bankB', name: 'Bank B', type: 'bank', opening_balance_paise: 0 },
  { key: 'cash', name: 'Cash', type: 'cash', opening_balance_paise: 20000 },
  { key: 'cardC', name: 'Card C', type: 'card', opening_balance_paise: 0 },
] as const;

export const FIXTURE_OPENING_DATE = '2026-09-30';

export type FixtureAccountKey = (typeof FIXTURE_ACCOUNTS)[number]['key'];

export interface FixtureTransaction {
  date: string;
  type: 'expense' | 'income' | 'transfer' | 'refund';
  amount_paise: number;
  account: FixtureAccountKey;
  to?: FixtureAccountKey;
  category?: string;
  note: string;
}

export const FIXTURE_TRANSACTIONS: FixtureTransaction[] = [
  { date: '2026-10-01', type: 'income', amount_paise: 500000, account: 'bankA', category: 'Salary', note: 'Salary' },
  { date: '2026-10-03', type: 'expense', amount_paise: 12000, account: 'bankA', category: 'Food & dining', note: 'Cafe 1' },
  { date: '2026-10-03', type: 'expense', amount_paise: 12000, account: 'bankA', category: 'Food & dining', note: 'Cafe 2' },
  { date: '2026-10-04', type: 'expense', amount_paise: 12000, account: 'bankA', category: 'Health', note: 'Pharmacy' },
  { date: '2026-10-04', type: 'expense', amount_paise: 6000, account: 'cash', category: 'Transport', note: 'Parking' },
  { date: '2026-10-05', type: 'expense', amount_paise: 80000, account: 'cardC', category: 'Groceries', note: 'Groceries' },
  { date: '2026-10-07', type: 'transfer', amount_paise: 30000, account: 'bankA', to: 'cardC', note: 'Card bill' },
  { date: '2026-10-08', type: 'transfer', amount_paise: 10000, account: 'bankA', to: 'cash', note: 'ATM' },
  { date: '2026-10-09', type: 'transfer', amount_paise: 5000, account: 'bankA', to: 'bankB', note: 'Own transfer' },
  { date: '2026-10-10', type: 'income', amount_paise: 100000, account: 'bankA', category: 'Freelance', note: 'Freelance' },
  { date: '2026-10-12', type: 'refund', amount_paise: 10000, account: 'cardC', category: 'Groceries', note: 'Grocery refund' },
  { date: '2026-10-14', type: 'expense', amount_paise: 2000, account: 'cardC', category: 'Fees & interest', note: 'Card fee' },
];
