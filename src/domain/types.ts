/** Row shapes as stored in the database (see supabase/migrations). Money is integer paise. */

export type AccountType = 'bank' | 'cash' | 'card';
export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund';
export type CategoryKind = 'expense' | 'income';
export type TransactionSource = 'manual' | 'voice' | 'import' | 'recurring';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  opening_balance_paise: number;
  opening_date: string;
  nickname: string | null;
  card_due_day: number | null;
  archived: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  archived: boolean;
}

export interface Recipient {
  id: string;
  name: string;
  aliases: string[];
  default_category_id: string | null;
}

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  amount_paise: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  recipient_id: string | null;
  note: string | null;
  source: TransactionSource;
  import_batch_id: string | null;
  recurring_item_id: string | null;
  created_at: string;
}

export interface RecurringItem {
  id: string;
  name: string;
  type: 'expense' | 'transfer';
  amount_paise: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  day_of_month: number;
  next_due_date: string;
  /** null = no end; for EMIs, how many payments remain. */
  instalments_left: number | null;
  active: boolean;
}

export interface Budget {
  id: string;
  category_id: string;
  monthly_limit_paise: number;
}

export interface Settings {
  user_id: string;
  default_account_id: string | null;
}

/** Which category list applies to a transaction type. Transfers have no category. */
export function categoryKindFor(type: TransactionType): CategoryKind | null {
  if (type === 'income') return 'income';
  if (type === 'transfer') return null;
  return 'expense'; // expense and refund
}

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  refund: 'Refund',
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Bank',
  cash: 'Cash',
  card: 'Credit card',
};
