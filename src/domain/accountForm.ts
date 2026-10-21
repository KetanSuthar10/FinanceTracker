import { isValidISODate } from '../lib/dates';
import { parseRupeesToPaise } from '../lib/money';
import type { AccountType } from './types';

export interface AccountFormValues {
  name: string;
  type: AccountType;
  /** For bank/cash: balance on the opening date. For cards: amount owed on that date. Always typed as positive. */
  openingAmountText: string;
  /** Bank/cash only: tick when the balance was overdrawn (negative). */
  openingIsNegative: boolean;
  openingDate: string;
  nickname: string;
  cardDueDay: string;
}

export type AccountFormField = keyof AccountFormValues;

export interface ValidAccount {
  name: string;
  type: AccountType;
  opening_balance_paise: number;
  opening_date: string;
  nickname: string | null;
  card_due_day: number | null;
}

export function validateAccountForm(
  v: AccountFormValues,
): { ok: true; value: ValidAccount } | { ok: false; errors: Partial<Record<AccountFormField, string>> } {
  const errors: Partial<Record<AccountFormField, string>> = {};
  const name = v.name.replace(/\s+/g, ' ').trim();
  if (!name) errors.name = 'Give the account a name, like "HDFC Savings".';
  else if (name.length > 60) errors.name = 'Keep the name under 60 characters.';

  const amountText = v.openingAmountText.trim();
  const amount = amountText === '' || /^0+(\.0+)?$/.test(amountText) ? 0 : parseRupeesToPaise(amountText);
  if (amount === null) errors.openingAmountText = 'Enter an amount like 15000 or 15000.50.';

  if (!isValidISODate(v.openingDate)) errors.openingDate = 'Choose a valid date.';

  const nickname = v.nickname.replace(/\s+/g, ' ').trim();
  if (nickname.length > 30) errors.nickname = 'Keep the nickname under 30 characters.';

  let dueDay: number | null = null;
  if (v.type === 'card' && v.cardDueDay.trim()) {
    const n = Number(v.cardDueDay);
    if (!Number.isInteger(n) || n < 1 || n > 31) errors.cardDueDay = 'Enter a day between 1 and 31.';
    else dueDay = n;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // Cards: money owed is stored as a negative balance (docs/MONEY_RULES.md).
  const negative = v.type === 'card' ? true : v.openingIsNegative;
  return {
    ok: true,
    value: {
      name,
      type: v.type,
      opening_balance_paise: amount === 0 ? 0 : negative ? -amount! : amount!,
      opening_date: v.openingDate,
      nickname: nickname || null,
      card_due_day: dueDay,
    },
  };
}

/** Inverse of the above, for editing an existing account. */
export function accountToForm(a: {
  name: string;
  type: AccountType;
  opening_balance_paise: number;
  opening_date: string;
  nickname: string | null;
  card_due_day: number | null;
}): AccountFormValues {
  const abs = Math.abs(a.opening_balance_paise);
  const rupees = Math.trunc(abs / 100);
  const rest = abs % 100;
  return {
    name: a.name,
    type: a.type,
    openingAmountText: rest ? `${rupees}.${String(rest).padStart(2, '0')}` : String(rupees),
    openingIsNegative: a.type !== 'card' && a.opening_balance_paise < 0,
    openingDate: a.opening_date,
    nickname: a.nickname ?? '',
    cardDueDay: a.card_due_day ? String(a.card_due_day) : '',
  };
}
