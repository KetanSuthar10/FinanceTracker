/** TanStack Query cache keys, in one place so invalidation stays consistent. */
export const keys = {
  accounts: ['accounts'] as const,
  accountTotals: ['account-totals'] as const,
  categories: ['categories'] as const,
  recipients: ['recipients'] as const,
  settings: ['settings'] as const,
  recurring: ['recurring'] as const,
  budgets: ['budgets'] as const,
  transactions: ['transactions'] as const,
  transactionsBetween: (from: string, through: string) => ['transactions', 'between', from, through] as const,
  transaction: (id: string) => ['transactions', 'one', id] as const,
};
