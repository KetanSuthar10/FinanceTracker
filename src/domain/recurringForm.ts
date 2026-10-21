import { isValidISODate } from '../lib/dates';
import { parseRupeesToPaise, paiseToInputText } from '../lib/money';
import type { RecurringItem } from './types';

export interface RecurringFormValues {
  name: string;
  type: 'expense' | 'transfer';
  amountText: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  dayOfMonth: string;
  nextDueDate: string;
  /** Optional, for EMIs: how many payments are left (including the next one). */
  instalmentsText: string;
  active: boolean;
}

export type RecurringFormField = keyof RecurringFormValues;

export type ValidRecurring = Omit<RecurringItem, 'id'>;

export function validateRecurringForm(
  v: RecurringFormValues,
): { ok: true; value: ValidRecurring } | { ok: false; errors: Partial<Record<RecurringFormField, string>> } {
  const errors: Partial<Record<RecurringFormField, string>> = {};
  const name = v.name.replace(/\s+/g, ' ').trim();
  if (!name) errors.name = 'Give it a name, like "Rent" or "Phone EMI".';
  else if (name.length > 60) errors.name = 'Keep the name under 60 characters.';

  const amount = parseRupeesToPaise(v.amountText);
  if (amount === null) errors.amountText = 'Enter an amount like 15000 or 1999.50.';

  if (!v.accountId) errors.accountId = v.type === 'transfer' ? 'Choose where the money comes from.' : 'Choose the account it is paid from.';
  if (v.type === 'transfer') {
    if (!v.toAccountId) errors.toAccountId = 'Choose where the money goes.';
    else if (v.toAccountId === v.accountId) errors.toAccountId = 'Choose two different accounts.';
  }

  const day = Number(v.dayOfMonth);
  if (!Number.isInteger(day) || day < 1 || day > 31) errors.dayOfMonth = 'Enter a day between 1 and 31.';

  if (!isValidISODate(v.nextDueDate)) errors.nextDueDate = 'Choose a valid date.';

  let instalments: number | null = null;
  if (v.instalmentsText.trim()) {
    const n = Number(v.instalmentsText);
    if (!Number.isInteger(n) || n < 1 || n > 600) errors.instalmentsText = 'Enter a whole number from 1 to 600, or leave empty.';
    else instalments = n;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      type: v.type,
      amount_paise: amount!,
      account_id: v.accountId,
      to_account_id: v.type === 'transfer' ? v.toAccountId : null,
      category_id: v.type === 'transfer' ? null : v.categoryId || null,
      day_of_month: day,
      next_due_date: v.nextDueDate,
      instalments_left: instalments,
      active: v.active,
    },
  };
}

export function recurringToForm(item: RecurringItem): RecurringFormValues {
  return {
    name: item.name,
    type: item.type,
    amountText: paiseToInputText(item.amount_paise),
    accountId: item.account_id,
    toAccountId: item.to_account_id ?? '',
    categoryId: item.category_id ?? '',
    dayOfMonth: String(item.day_of_month),
    nextDueDate: item.next_due_date,
    instalmentsText: item.instalments_left === null ? '' : String(item.instalments_left),
    active: item.active,
  };
}
