/**
 * The single validation path for every transaction write: form, quick text, voice,
 * and later recurring "mark as paid". Returns either a clean payload or field errors.
 */
import { z } from 'zod';
import { isValidISODate } from '../lib/dates';
import { parseRupeesToPaise } from '../lib/money';
import { categoryKindFor, type Account, type Category, type TransactionSource, type TransactionType } from './types';

export interface TransactionFormValues {
  type: TransactionType;
  amountText: string;
  date: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  recipientName: string;
  note: string;
}

export type TransactionFormField = keyof TransactionFormValues;

/** What gets written. recipient_id is resolved separately from recipientName (recipient memory). */
export interface ValidTransaction {
  date: string;
  type: TransactionType;
  amount_paise: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  note: string | null;
  source: TransactionSource;
  recipientName: string | null;
}

export type ValidationResult =
  | { ok: true; value: ValidTransaction }
  | { ok: false; errors: Partial<Record<TransactionFormField, string>> };

const shape = z.object({
  type: z.enum(['expense', 'income', 'transfer', 'refund']),
  amountText: z.string(),
  date: z.string(),
  accountId: z.string(),
  toAccountId: z.string(),
  categoryId: z.string(),
  recipientName: z.string().max(80, 'Keep the name under 80 characters.'),
  note: z.string().max(500, 'Keep the note under 500 characters.'),
});

export function validateTransactionForm(
  values: TransactionFormValues,
  ctx: { accounts: Pick<Account, 'id'>[]; categories: Pick<Category, 'id' | 'kind'>[]; source?: TransactionSource },
): ValidationResult {
  const errors: Partial<Record<TransactionFormField, string>> = {};
  const parsed = shape.safeParse(values);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as TransactionFormField;
      errors[field] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const v = parsed.data;

  const amount = parseRupeesToPaise(v.amountText);
  if (amount === null) errors.amountText = 'Enter an amount like 120 or 120.50.';

  if (!isValidISODate(v.date)) errors.date = 'Choose a valid date.';

  const accountExists = (id: string) => ctx.accounts.some((a) => a.id === id);
  if (!v.accountId) errors.accountId = v.type === 'transfer' ? 'Choose where the money comes from.' : 'Choose an account.';
  else if (!accountExists(v.accountId)) errors.accountId = 'That account no longer exists.';

  const isTransfer = v.type === 'transfer';
  if (isTransfer) {
    if (!v.toAccountId) errors.toAccountId = 'Choose where the money goes.';
    else if (!accountExists(v.toAccountId)) errors.toAccountId = 'That account no longer exists.';
    else if (v.toAccountId === v.accountId) errors.toAccountId = 'Choose two different accounts.';
  }

  const kind = categoryKindFor(v.type);
  let categoryId: string | null = null;
  if (!isTransfer && v.categoryId) {
    const category = ctx.categories.find((c) => c.id === v.categoryId);
    if (!category) errors.categoryId = 'That category no longer exists.';
    else if (category.kind !== kind) errors.categoryId = `Pick ${kind === 'income' ? 'an income' : 'an expense'} category.`;
    else categoryId = category.id;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const recipient = v.recipientName.replace(/\s+/g, ' ').trim();
  const note = v.note.trim();
  return {
    ok: true,
    value: {
      date: v.date,
      type: v.type,
      amount_paise: amount!,
      account_id: v.accountId,
      to_account_id: isTransfer ? v.toAccountId : null,
      category_id: categoryId,
      note: note || null,
      source: ctx.source ?? 'manual',
      recipientName: isTransfer || !recipient ? null : recipient,
    },
  };
}
