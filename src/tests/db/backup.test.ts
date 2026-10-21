import { beforeAll, describe, expect, it } from 'vitest';
import type { Transaction } from '@electric-sql/pglite';
import { buildBackup, validateBackup, type BackupData } from '../../domain/backup';
import { computePositions, type AccountTotals } from '../../domain/balances';
import { FIXTURE_ACCOUNTS, FIXTURE_OPENING_DATE, FIXTURE_TRANSACTIONS } from '../fixture';
import { createTestDb, type TestDb } from './testDb';

// The same columns the app exports (src/data/backup.ts).
const COLUMNS = {
  accounts: 'id, name, type, opening_balance_paise, opening_date::text, nickname, card_due_day, archived',
  categories: 'id, name, kind, archived',
  recipients: 'id, name, aliases, default_category_id',
  import_batches: 'id, account_id, file_name, row_count, added_count, skipped_count, created_at::text',
  recurring_items:
    'id, name, type, amount_paise, account_id, to_account_id, category_id, day_of_month, next_due_date::text, instalments_left, active',
  transactions:
    'id, date::text, type, amount_paise, account_id, to_account_id, category_id, recipient_id, note, source, import_batch_id, import_hash, recurring_item_id, created_at::text',
  budgets: 'id, category_id, monthly_limit_paise',
  import_mappings: 'id, account_id, mapping',
} as const;

async function exportAll(tx: Transaction): Promise<BackupData> {
  const out: Record<string, unknown[]> = {};
  for (const [table, cols] of Object.entries(COLUMNS)) {
    const { rows } = await tx.query<Record<string, unknown>>(`select ${cols} from public.${table} order by id`);
    out[table] = rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])),
    );
  }
  const settings = (await tx.query<{ default_account_id: string | null }>('select default_account_id from public.settings')).rows[0] ?? null;
  return { ...(out as unknown as Omit<BackupData, 'settings'>), settings };
}

async function positions(tx: Transaction) {
  const accounts = (await tx.query<{ id: string; type: 'bank' | 'cash' | 'card'; opening_balance_paise: number }>(
    'select id, type, opening_balance_paise from public.accounts',
  )).rows.map((a) => ({ ...a, opening_balance_paise: Number(a.opening_balance_paise) }));
  const totals = (await tx.query<AccountTotals>('select * from public.account_totals()')).rows.map((r) => ({
    account_id: r.account_id,
    income_in_paise: Number(r.income_in_paise),
    refund_in_paise: Number(r.refund_in_paise),
    expense_out_paise: Number(r.expense_out_paise),
    transfer_in_paise: Number(r.transfer_in_paise),
    transfer_out_paise: Number(r.transfer_out_paise),
  }));
  return computePositions(accounts, totals);
}

let source: TestDb;
let owner: string;
let backupText: string;

beforeAll(async () => {
  source = await createTestDb();
  owner = await source.createUser('owner@example.com');
  backupText = await source.asUser(owner, async (tx) => {
    await tx.query('select public.ensure_starter_data()');
    const cats = new Map((await tx.query<{ id: string; name: string }>('select id, name from public.categories')).rows.map((c) => [c.name, c.id]));
    const ids: Record<string, string> = {};
    for (const a of FIXTURE_ACCOUNTS) {
      ids[a.key] = (await tx.query<{ id: string }>(
        'insert into public.accounts (name, type, opening_balance_paise, opening_date) values ($1, $2, $3, $4) returning id',
        [a.name, a.type, a.opening_balance_paise, FIXTURE_OPENING_DATE],
      )).rows[0]!.id;
    }
    const cafe = (await tx.query<{ id: string }>(`insert into public.recipients (name, aliases, default_category_id) values ('Cafe', '{ccd}', $1) returning id`, [cats.get('Food & dining')])).rows[0]!.id;
    for (const t of FIXTURE_TRANSACTIONS) {
      await tx.query(
        `insert into public.transactions (date, type, amount_paise, account_id, to_account_id, category_id, recipient_id, note)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [t.date, t.type, t.amount_paise, ids[t.account], t.to ? ids[t.to] : null, t.category ? cats.get(t.category) : null, t.note.startsWith('Cafe') ? cafe : null, t.note],
      );
    }
    await tx.query(`insert into public.budgets (category_id, monthly_limit_paise) values ($1, 100000)`, [cats.get('Groceries')]);
    await tx.query(
      `insert into public.recurring_items (name, type, amount_paise, account_id, category_id, day_of_month, next_due_date, instalments_left)
       values ('Phone EMI', 'expense', 20000, $1, $2, 20, '2026-11-20', 5)`,
      [ids.bankA, cats.get('Loan EMI')],
    );
    await tx.query('update public.settings set default_account_id = $1', [ids.bankA]);
    return JSON.stringify(await buildBackup(await exportAll(tx)));
  });
}, 60_000);

describe('backup and restore', () => {
  it('a valid backup passes every check', async () => {
    const result = await validateBackup(backupText);
    expect(result.ok && result.summary).toMatchObject({ accounts: 4, transactions: 12, firstDate: '2026-10-01', lastDate: '2026-10-14', reminders: 1, budgets: 1 });
  });

  it('restores into a fresh, empty app with identical balances, links and settings', async () => {
    const target = await createTestDb();
    const me = await target.createUser('me@example.com');
    await target.asUser(me, (tx) => tx.query('select public.ensure_starter_data()')); // like a first sign-in
    const result = await validateBackup(backupText);
    if (!result.ok) throw new Error(result.problems.join('; '));
    await target.asUser(me, (tx) => tx.query('select public.restore_backup($1)', [JSON.stringify(result.backup.data)]));

    const before = await source.asUser(owner, positions);
    const after = await target.asUser(me, positions);
    expect(after.netPositionPaise).toBe(606000);
    expect(after.moneyInHandPaise).toBe(before.moneyInHandPaise);
    expect([...after.balances.entries()].sort()).toEqual([...before.balances.entries()].sort());

    const again = await target.asUser(me, exportAll);
    const original = (await validateBackup(backupText)) as { ok: true; backup: { data: BackupData } };
    expect(again).toEqual(original.backup.data);
  });

  it('refuses to restore over existing data', async () => {
    const result = (await validateBackup(backupText)) as { ok: true; backup: { data: BackupData } };
    await expect(
      source.asUser(owner, (tx) => tx.query('select public.restore_backup($1)', [JSON.stringify(result.backup.data)])),
    ).rejects.toThrow(/empty app/);
  });

  it('a bad row inside the backup makes the whole restore fail and changes nothing', async () => {
    const target = await createTestDb();
    const me = await target.createUser('me@example.com');
    await target.asUser(me, (tx) => tx.query('select public.ensure_starter_data()'));
    const data = JSON.parse(backupText).data as BackupData;
    data.transactions[5] = { ...data.transactions[5]!, amount_paise: 0 };
    await expect(target.asUser(me, (tx) => tx.query('select public.restore_backup($1)', [JSON.stringify(data)]))).rejects.toThrow(/check constraint/);
    const counts = await target.asUser(me, async (tx) => [
      Number((await tx.query<{ n: number }>('select count(*)::int as n from public.categories')).rows[0]!.n),
      Number((await tx.query<{ n: number }>('select count(*)::int as n from public.accounts')).rows[0]!.n),
    ]);
    expect(counts).toEqual([18, 0]); // starter categories untouched, nothing restored
  });
});

describe('validateBackup catches problems before anything is written', () => {
  it('rejects edited contents (checksum)', async () => {
    const file = JSON.parse(backupText);
    file.data.transactions[0].amount_paise += 100;
    const result = await validateBackup(JSON.stringify(file));
    expect(result.ok ? '' : result.problems[0]).toMatch(/changed or damaged/);
  });

  it('rejects broken links even with a matching checksum', async () => {
    const file = JSON.parse(backupText);
    file.data.transactions[0].account_id = '00000000-0000-4000-8000-000000000000';
    const rebuilt = await buildBackup(file.data);
    const result = await validateBackup(JSON.stringify(rebuilt));
    expect(result.ok ? '' : result.problems.join(' ')).toMatch(/missing account/);
  });

  it('rejects non-backups and fractional money', async () => {
    expect((await validateBackup('hello')).ok).toBe(false);
    expect((await validateBackup('{"app":"other"}')).ok).toBe(false);
    const file = JSON.parse(backupText);
    file.data.transactions[0].amount_paise = 120.5;
    expect((await validateBackup(JSON.stringify(await buildBackup(file.data)))).ok).toBe(false);
  });
});
