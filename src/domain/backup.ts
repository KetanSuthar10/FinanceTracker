/**
 * Backup format (version 1) and the checks run before a restore.
 * Money is integer paise, dates are YYYY-MM-DD (Asia/Kolkata). IDs are kept so links survive.
 */
import { z } from 'zod';
import { isValidISODate } from '../lib/dates';
import { formatINR } from '../lib/money';
import type { Account, Category, Recipient, Transaction } from './types';

export const BACKUP_VERSION = 1;

const uuid = z.string().uuid();
const date = z.string().refine(isValidISODate, 'not a real date');
const paise = z.number().int().refine(Number.isSafeInteger);
const positivePaise = paise.refine((n) => n > 0, 'must be more than zero');

const accountSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(60),
  type: z.enum(['bank', 'cash', 'card']),
  opening_balance_paise: paise,
  opening_date: date,
  nickname: z.string().max(30).nullable(),
  card_due_day: z.number().int().min(1).max(31).nullable(),
  archived: z.boolean(),
});
const categorySchema = z.object({ id: uuid, name: z.string().min(1).max(40), kind: z.enum(['expense', 'income']), archived: z.boolean() });
const recipientSchema = z.object({ id: uuid, name: z.string().min(1).max(80), aliases: z.array(z.string()), default_category_id: uuid.nullable() });
const batchSchema = z.object({
  id: uuid,
  account_id: uuid,
  file_name: z.string(),
  row_count: z.number().int().min(0),
  added_count: z.number().int().min(0),
  skipped_count: z.number().int().min(0),
  created_at: z.string(),
});
const recurringSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(60),
  type: z.enum(['expense', 'transfer']),
  amount_paise: positivePaise,
  account_id: uuid,
  to_account_id: uuid.nullable(),
  category_id: uuid.nullable(),
  day_of_month: z.number().int().min(1).max(31),
  next_due_date: date,
  instalments_left: z.number().int().min(0).nullable(),
  active: z.boolean(),
});
const transactionSchema = z.object({
  id: uuid,
  date,
  type: z.enum(['expense', 'income', 'transfer', 'refund']),
  amount_paise: positivePaise,
  account_id: uuid,
  to_account_id: uuid.nullable(),
  category_id: uuid.nullable(),
  recipient_id: uuid.nullable(),
  note: z.string().max(500).nullable(),
  source: z.enum(['manual', 'voice', 'import', 'recurring']),
  import_batch_id: uuid.nullable(),
  import_hash: z.string().nullable(),
  recurring_item_id: uuid.nullable(),
  created_at: z.string(),
});
const budgetSchema = z.object({ id: uuid, category_id: uuid, monthly_limit_paise: positivePaise });
const mappingSchema = z.object({ id: uuid, account_id: uuid, mapping: z.record(z.string(), z.unknown()) });
const settingsSchema = z.object({ default_account_id: uuid.nullable() });

const dataSchema = z.object({
  accounts: z.array(accountSchema),
  categories: z.array(categorySchema),
  recipients: z.array(recipientSchema),
  import_batches: z.array(batchSchema),
  recurring_items: z.array(recurringSchema),
  transactions: z.array(transactionSchema),
  budgets: z.array(budgetSchema),
  import_mappings: z.array(mappingSchema),
  settings: settingsSchema.nullable(),
});

export type BackupData = z.infer<typeof dataSchema>;

const fileSchema = z.object({
  app: z.literal('finance-tracker'),
  version: z.literal(BACKUP_VERSION),
  exported_at: z.string(),
  money: z.literal('integer paise (INR)'),
  timezone: z.literal('Asia/Kolkata'),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  data: dataSchema,
});

export type BackupFile = z.infer<typeof fileSchema>;

/** Stable JSON (sorted keys) so the checksum doesn't depend on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildBackup(data: BackupData, now = new Date()): Promise<BackupFile> {
  return {
    app: 'finance-tracker',
    version: BACKUP_VERSION,
    exported_at: now.toISOString(),
    money: 'integer paise (INR)',
    timezone: 'Asia/Kolkata',
    checksum: await sha256(canonicalJson(data)),
    data,
  };
}

export interface BackupSummary {
  accounts: number;
  transactions: number;
  categories: number;
  recipients: number;
  reminders: number;
  budgets: number;
  firstDate: string | null;
  lastDate: string | null;
  exportedAt: string;
}

export type ValidateResult = { ok: true; backup: BackupFile; summary: BackupSummary } | { ok: false; problems: string[] };

/** Checks shape, checksum and that every link points at something inside the backup. Writes nothing. */
export async function validateBackup(text: string): Promise<ValidateResult> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, problems: ['This is not a backup file (it is not valid JSON).'] };
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`);
    return { ok: false, problems: ['This file is not a valid Finance Tracker backup.', ...first] };
  }
  const backup = parsed.data;
  if ((await sha256(canonicalJson(backup.data))) !== backup.checksum) {
    return { ok: false, problems: ['The backup was changed or damaged after it was made (checksum does not match).'] };
  }

  const d = backup.data;
  const problems: string[] = [];
  const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  const accounts = ids(d.accounts);
  const categories = ids(d.categories);
  const recipients = ids(d.recipients);
  const batches = ids(d.import_batches);
  const recurring = ids(d.recurring_items);
  const missing = (set: Set<string>, id: string | null) => id !== null && !set.has(id);

  for (const t of d.transactions) {
    const where = `Transaction on ${t.date} of ${formatINR(t.amount_paise)}`;
    if (missing(accounts, t.account_id) || missing(accounts, t.to_account_id)) problems.push(`${where} points to a missing account.`);
    if ((t.type === 'transfer') !== (t.to_account_id !== null)) problems.push(`${where}: only transfers have a destination account.`);
    if (t.to_account_id && t.to_account_id === t.account_id) problems.push(`${where}: transfer to the same account.`);
    if (t.type === 'transfer' && t.category_id) problems.push(`${where}: transfers have no category.`);
    if (missing(categories, t.category_id)) problems.push(`${where} points to a missing category.`);
    if (missing(recipients, t.recipient_id)) problems.push(`${where} points to a missing recipient.`);
    if (missing(batches, t.import_batch_id)) problems.push(`${where} points to a missing import.`);
    if (missing(recurring, t.recurring_item_id)) problems.push(`${where} points to a missing reminder.`);
    if ((t.import_batch_id === null) !== (t.import_hash === null)) problems.push(`${where}: import details are incomplete.`);
  }
  for (const r of d.recurring_items) {
    if (missing(accounts, r.account_id) || missing(accounts, r.to_account_id) || missing(categories, r.category_id)) {
      problems.push(`Reminder "${r.name}" points to something missing.`);
    }
  }
  for (const r of d.recipients) if (missing(categories, r.default_category_id)) problems.push(`Recipient "${r.name}" points to a missing category.`);
  for (const b of d.budgets) if (missing(categories, b.category_id)) problems.push('A budget points to a missing category.');
  for (const b of d.import_batches) if (missing(accounts, b.account_id)) problems.push(`Import "${b.file_name}" points to a missing account.`);
  for (const m of d.import_mappings) if (missing(accounts, m.account_id)) problems.push('A saved column mapping points to a missing account.');
  if (d.settings && missing(accounts, d.settings.default_account_id)) problems.push('The default account is missing.');

  if (problems.length) return { ok: false, problems: [...new Set(problems)].slice(0, 10) };

  const dates = d.transactions.map((t) => t.date).sort();
  return {
    ok: true,
    backup,
    summary: {
      accounts: d.accounts.length,
      transactions: d.transactions.length,
      categories: d.categories.length,
      recipients: d.recipients.length,
      reminders: d.recurring_items.length,
      budgets: d.budgets.length,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      exportedAt: backup.exported_at,
    },
  };
}

// ---------------------------------------------------------------------------
// CSV export of transactions
// ---------------------------------------------------------------------------
const quote = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** Text from statements/notes: a leading = + - @ could run as a formula in Excel, so neutralise it. */
const textCell = (v: string) => quote(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** "120.50" style plain number (no ₹, no commas) so spreadsheets can add it up. */
export function paiseToPlain(paise: number): string {
  const abs = Math.abs(paise);
  return `${paise < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function transactionsToCsv(
  transactions: Pick<Transaction, 'date' | 'type' | 'amount_paise' | 'account_id' | 'to_account_id' | 'category_id' | 'recipient_id' | 'note' | 'source'>[],
  lookup: { accounts: Pick<Account, 'id' | 'name'>[]; categories: Pick<Category, 'id' | 'name'>[]; recipients: Pick<Recipient, 'id' | 'name'>[] },
): string {
  const name = (list: { id: string; name: string }[], id: string | null) => (id ? (list.find((x) => x.id === id)?.name ?? '') : '');
  const header = ['Date', 'Type', 'Amount', 'Spending effect', 'Account', 'To account', 'Category', 'Name', 'Note', 'Entered by'];
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const effect = t.type === 'expense' ? t.amount_paise : t.type === 'refund' ? -t.amount_paise : 0;
      return [
        t.date,
        t.type,
        paiseToPlain(t.amount_paise),
        paiseToPlain(effect),
        textCell(name(lookup.accounts, t.account_id)),
        textCell(name(lookup.accounts, t.to_account_id)),
        textCell(name(lookup.categories, t.category_id)),
        textCell(name(lookup.recipients, t.recipient_id)),
        textCell(t.note ?? ''),
        t.source,
      ].join(',');
    });
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}
