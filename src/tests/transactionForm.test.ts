import { describe, expect, it } from 'vitest';
import { validateTransactionForm, type TransactionFormValues } from '../domain/transactionForm';

const ctx = {
  accounts: [{ id: 'bank' }, { id: 'cash' }],
  categories: [
    { id: 'food', kind: 'expense' as const },
    { id: 'salary', kind: 'income' as const },
  ],
};

const base: TransactionFormValues = {
  type: 'expense',
  amountText: '120',
  date: '2026-10-21',
  accountId: 'bank',
  toAccountId: '',
  categoryId: 'food',
  recipientName: '  Third   Wave ',
  note: '',
};

const errorsOf = (values: Partial<TransactionFormValues>) => {
  const r = validateTransactionForm({ ...base, ...values }, ctx);
  return r.ok ? {} : r.errors;
};

describe('validateTransactionForm', () => {
  it('builds a clean payload', () => {
    expect(validateTransactionForm(base, { ...ctx, source: 'voice' })).toEqual({
      ok: true,
      value: {
        date: '2026-10-21',
        type: 'expense',
        amount_paise: 12000,
        account_id: 'bank',
        to_account_id: null,
        category_id: 'food',
        note: null,
        source: 'voice',
        recipientName: 'Third Wave',
      },
    });
  });

  it('rejects missing, zero and over-precise amounts — never defaults one', () => {
    for (const amountText of ['', '0', 'abc', '1.234', '-5']) {
      expect(errorsOf({ amountText })).toHaveProperty('amountText');
    }
  });

  it('rejects impossible dates and missing accounts', () => {
    expect(errorsOf({ date: '2026-02-31' })).toHaveProperty('date');
    expect(errorsOf({ accountId: '' })).toHaveProperty('accountId');
    expect(errorsOf({ accountId: 'gone' })).toHaveProperty('accountId');
  });

  it('requires two different accounts for a transfer and drops category/recipient', () => {
    expect(errorsOf({ type: 'transfer', categoryId: '' })).toHaveProperty('toAccountId');
    expect(errorsOf({ type: 'transfer', toAccountId: 'bank' })).toHaveProperty('toAccountId');
    const r = validateTransactionForm({ ...base, type: 'transfer', toAccountId: 'cash' }, ctx);
    expect(r.ok && r.value).toMatchObject({ to_account_id: 'cash', category_id: null, recipientName: null });
  });

  it('checks the category matches the type', () => {
    expect(errorsOf({ type: 'income', categoryId: 'food' })).toHaveProperty('categoryId');
    expect(errorsOf({ type: 'refund', categoryId: 'salary' })).toHaveProperty('categoryId');
    expect(errorsOf({ type: 'income', categoryId: 'salary' })).toEqual({});
  });

  it('allows leaving the category empty', () => {
    const r = validateTransactionForm({ ...base, categoryId: '' }, ctx);
    expect(r.ok && r.value.category_id).toBeNull();
  });
});
