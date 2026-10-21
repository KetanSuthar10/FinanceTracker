import type { Account, Category, Recipient, Transaction } from '../../domain/types';

export interface RowLookups {
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
  recipientById: Map<string, Recipient>;
}

export function transactionTitle(t: Transaction, l: RowLookups): string {
  if (t.type === 'transfer') {
    const from = l.accountById.get(t.account_id)?.name ?? 'Account';
    const to = l.accountById.get(t.to_account_id ?? '')?.name ?? 'Account';
    return `${from} → ${to}`;
  }
  return l.recipientById.get(t.recipient_id ?? '')?.name ?? t.note ?? (t.type === 'income' ? 'Income' : 'Expense');
}
