/**
 * Turns parsed statement rows into reviewable rows: status, default type, suggested recipient and category.
 * Nothing here writes data; the person confirms every row before import.
 */
import {
  CARD_PAYMENT_RE,
  CARD_RECEIVED_RE,
  INTEREST_RE,
  REFUND_RE,
  suggestRecipient,
  type Direction,
  type ParsedRow,
} from './importer';
import { guessCategory } from './parseQuickText';
import { findRecipient } from './recipients';
import { categoryKindFor, type Account, type Category, type Recipient, type Transaction, type TransactionType } from './types';

export type ReviewStatus = 'new' | 'imported' | 'possible';

export interface ReviewRow extends ParsedRow {
  hash: string;
  status: ReviewStatus;
  /** For 'possible': the existing transaction this row may duplicate. */
  matchId: string | null;
  include: boolean;
  type: TransactionType;
  /** The other account of a transfer (where money went to, or came from). */
  counterAccountId: string | null;
  categoryId: string | null;
  recipientName: string;
}

export type ExistingTransaction = Pick<
  Transaction,
  'id' | 'date' | 'type' | 'amount_paise' | 'account_id' | 'to_account_id'
> & { import_hash: string | null; recipient_id?: string | null; note?: string | null };

export interface ReviewContext {
  account: Pick<Account, 'id' | 'type'>;
  accounts: Pick<Account, 'id' | 'type' | 'archived'>[];
  defaultAccountId: string | null;
  recipients: Recipient[];
  categories: Pick<Category, 'id' | 'name' | 'kind' | 'archived'>[];
  /** Transactions touching this account around the statement's dates (with import hashes). */
  existing: ExistingTransaction[];
}

/** Which way an existing transaction moved money for `accountId`, or null if it doesn't touch it. */
export function directionFor(t: ExistingTransaction, accountId: string): Direction | null {
  if (t.type === 'transfer') {
    if (t.account_id === accountId) return 'out';
    if (t.to_account_id === accountId) return 'in';
    return null;
  }
  if (t.account_id !== accountId) return null;
  return t.type === 'expense' ? 'out' : 'in';
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

const only = (accounts: ReviewContext['accounts'], type: Account['type'], except: string) => {
  const list = accounts.filter((a) => a.type === type && !a.archived && a.id !== except);
  return list.length === 1 ? list[0]!.id : null;
};

function defaultType(row: ParsedRow, ctx: ReviewContext): { type: TransactionType; counter: string | null } {
  const { account, accounts } = ctx;
  const d = row.description;
  if (account.type === 'card') {
    if (row.direction === 'out') return { type: 'expense', counter: null };
    if (REFUND_RE.test(d)) return { type: 'refund', counter: null };
    if (CARD_RECEIVED_RE.test(d)) {
      const bank = accounts.find((a) => a.id === ctx.defaultAccountId && a.type === 'bank' && !a.archived)?.id ?? only(accounts, 'bank', account.id);
      return { type: 'transfer', counter: bank };
    }
    return { type: 'refund', counter: null };
  }
  if (row.direction === 'out') {
    if (CARD_PAYMENT_RE.test(d)) return { type: 'transfer', counter: only(accounts, 'card', account.id) };
    if (/\batm\b|cash withdrawal|\bcwdr\b|\bnwd\b|\bawd\b/i.test(d)) return { type: 'transfer', counter: only(accounts, 'cash', account.id) };
    return { type: 'expense', counter: null };
  }
  if (REFUND_RE.test(d)) return { type: 'refund', counter: null };
  return { type: 'income', counter: null };
}

function defaultCategory(row: ParsedRow, type: TransactionType, name: string, ctx: ReviewContext): { categoryId: string | null; recipientName: string } {
  const kind = categoryKindFor(type);
  if (!kind) return { categoryId: null, recipientName: '' };
  const known = findRecipient(name, ctx.recipients);
  const active = ctx.categories.filter((c) => !c.archived);
  if (known) {
    const remembered = active.find((c) => c.id === known.default_category_id && c.kind === kind);
    return { categoryId: remembered?.id ?? null, recipientName: known.name };
  }
  if (type === 'income' && INTEREST_RE.test(row.description)) {
    return { categoryId: active.find((c) => c.kind === 'income' && /^interest$/i.test(c.name))?.id ?? null, recipientName: name };
  }
  if (type === 'expense' && /\b(fee|fees|interest|finance charge|late payment|gst|annual charge)\b/i.test(row.description)) {
    return { categoryId: active.find((c) => /fees/i.test(c.name) && c.kind === 'expense')?.id ?? null, recipientName: name };
  }
  return { categoryId: guessCategory(name, active, kind)?.id ?? null, recipientName: name };
}

export function buildReview(rows: ParsedRow[], hashes: string[], ctx: ReviewContext): ReviewRow[] {
  const importedHashes = new Set(ctx.existing.map((t) => t.import_hash).filter(Boolean));
  const claimed = new Set<string>();

  // Match in date order so each existing transaction is claimed by its closest row first.
  const order = rows.map((_, i) => i).sort((a, b) => rows[a]!.date.localeCompare(rows[b]!.date) || a - b);
  const result: ReviewRow[] = new Array(rows.length);

  for (const i of order) {
    const row = rows[i]!;
    const hash = hashes[i]!;
    const { type, counter } = defaultType(row, ctx);
    const { categoryId, recipientName } = defaultCategory(row, type, suggestRecipient(row.description), ctx);
    const base = { ...row, hash, type, counterAccountId: counter, categoryId, recipientName };

    if (importedHashes.has(hash)) {
      result[i] = { ...base, status: 'imported', matchId: null, include: false };
      continue;
    }

    const candidates = ctx.existing
      .filter(
        (t) =>
          !claimed.has(t.id) &&
          t.amount_paise === row.amountPaise &&
          directionFor(t, ctx.account.id) === row.direction &&
          daysBetween(t.date, row.date) <= 3,
      )
      .sort((a, b) => daysBetween(a.date, row.date) - daysBetween(b.date, row.date));

    const match = candidates[0];
    if (match) {
      claimed.add(match.id);
      result[i] = { ...base, status: 'possible', matchId: match.id, include: false };
    } else {
      result[i] = { ...base, status: 'new', matchId: null, include: true };
    }
  }
  return result;
}

export interface ImportPayloadRow {
  date: string;
  type: TransactionType;
  amount_paise: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  recipient_id: string | null;
  recipient_name: string | null;
  note: string | null;
  import_hash: string;
}

export type PayloadResult =
  | { ok: true; rows: ImportPayloadRow[] }
  | { ok: false; problems: { line: number; reason: string }[] };

/** Builds the rows to write, or lists what still needs fixing (e.g. a transfer without the other account). */
export function toPayload(review: ReviewRow[], accountId: string, recipients: Recipient[]): PayloadResult {
  const problems: { line: number; reason: string }[] = [];
  const rows: ImportPayloadRow[] = [];
  for (const r of review) {
    if (!r.include || r.status === 'imported') continue;
    if (r.type === 'transfer') {
      if (!r.counterAccountId || r.counterAccountId === accountId) {
        problems.push({ line: r.line, reason: 'Choose the other account for this transfer' });
        continue;
      }
    }
    const isTransfer = r.type === 'transfer';
    const outgoing = r.direction === 'out';
    // Direction must agree with the type: money out can't be income/refund, money in can't be an expense.
    if (!isTransfer && (r.type === 'expense') !== outgoing) {
      problems.push({ line: r.line, reason: outgoing ? 'Money went out — choose Expense or Transfer' : 'Money came in — choose Income, Refund or Transfer' });
      continue;
    }
    const name = isTransfer ? '' : r.recipientName.replace(/\s+/g, ' ').trim().slice(0, 80);
    const known = name ? findRecipient(name, recipients) : undefined;
    rows.push({
      date: r.date,
      type: r.type,
      amount_paise: r.amountPaise,
      account_id: isTransfer && !outgoing ? r.counterAccountId! : accountId,
      to_account_id: isTransfer ? (outgoing ? r.counterAccountId! : accountId) : null,
      category_id: isTransfer ? null : r.categoryId,
      recipient_id: known?.id ?? null,
      recipient_name: known ? null : name || null,
      note: r.description.slice(0, 500) || null,
      import_hash: r.hash,
    });
  }
  return problems.length ? { ok: false, problems } : { ok: true, rows };
}
