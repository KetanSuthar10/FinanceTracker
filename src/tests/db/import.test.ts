import { beforeAll, describe, expect, it } from 'vitest';
import type { Transaction } from '@electric-sql/pglite';
import { createTestDb, type TestDb } from './testDb';

let t: TestDb;
let me: string;
let other: string;
let bank: string;
let card: string;

const commit = (tx: Transaction, batchId: string, rows: unknown[]) =>
  tx.query<{ commit_import: { batch_id: string; added: number; already_done: boolean } }>(
    'select public.commit_import($1, $2, $3, $4, $5, $6)',
    [batchId, bank, 'oct.csv', rows.length + 1, 1, JSON.stringify(rows)],
  );

const row = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-03',
  type: 'expense',
  amount_paise: 12000,
  account_id: bank,
  to_account_id: null,
  category_id: null,
  recipient_id: null,
  recipient_name: 'Third Wave Coffee',
  note: 'UPI/DR/1/THIRD WAVE COFFEE',
  import_hash: 'h1',
  ...over,
});

const count = (sql: string, params: unknown[] = []) =>
  t.asUser(me, async (tx) => Number((await tx.query<{ n: number }>(sql, params)).rows[0]!.n));

beforeAll(async () => {
  t = await createTestDb();
  me = await t.createUser('me@example.com');
  other = await t.createUser('other@example.com');
  await t.asUser(me, async (tx) => {
    const a = await tx.query<{ id: string }>(
      `insert into public.accounts (name, type, opening_date) values ('Bank', 'bank', '2026-09-30'), ('Card', 'card', '2026-09-30') returning id`,
    );
    bank = a.rows[0]!.id;
    card = a.rows[1]!.id;
  });
}, 60_000);

describe('commit_import', () => {
  const batchA = '00000000-0000-4000-8000-00000000000a';

  it('imports all rows, creates recipients once, and handles a card payment transfer', async () => {
    const result = await t.asUser(me, async (tx) => {
      const r = await commit(tx, batchA, [
        row(),
        row({ import_hash: 'h2', recipient_name: 'third wave coffee' }), // same recipient, other capitalisation
        row({ import_hash: 'h3', type: 'transfer', to_account_id: card, recipient_name: null, amount_paise: 30000 }),
      ]);
      return r.rows[0]!.commit_import;
    });
    expect(result).toMatchObject({ batch_id: batchA, added: 3, already_done: false });
    expect(await count('select count(*)::int as n from public.recipients')).toBe(1);
    expect(await count('select count(*)::int as n from public.transactions where import_batch_id = $1 and source = $2', [batchA, 'import'])).toBe(3);
    expect(await count('select added_count as n from public.import_batches where id = $1', [batchA])).toBe(3);
  });

  it('a retry with the same batch id writes nothing more', async () => {
    const again = await t.asUser(me, async (tx) => (await commit(tx, batchA, [row()])).rows[0]!.commit_import);
    expect(again).toMatchObject({ added: 3, already_done: true });
    expect(await count('select count(*)::int as n from public.transactions')).toBe(3);
  });

  it('a new batch containing an already-imported row fails completely (no partial import)', async () => {
    await expect(
      t.asUser(me, (tx) => commit(tx, '00000000-0000-4000-8000-00000000000b', [row({ import_hash: 'new-1' }), row({ import_hash: 'h1' })])),
    ).rejects.toThrow(/duplicate key/);
    expect(await count('select count(*)::int as n from public.transactions')).toBe(3);
    expect(await count('select count(*)::int as n from public.import_batches')).toBe(1);
  });

  it('an invalid row rolls back the whole import', async () => {
    await expect(
      t.asUser(me, (tx) => commit(tx, '00000000-0000-4000-8000-00000000000c', [row({ import_hash: 'ok' }), row({ import_hash: 'bad', amount_paise: 0 })])),
    ).rejects.toThrow(/check constraint/);
    expect(await count('select count(*)::int as n from public.transactions')).toBe(3);
  });

  it("can't import into someone else's account", async () => {
    await expect(
      t.asUser(other, (tx) => commit(tx, '00000000-0000-4000-8000-00000000000d', [row({ import_hash: 'x' })])),
    ).rejects.toThrow(/foreign key|violates/);
  });

  it('undo (deleting the batch) removes exactly its transactions and keeps manual ones', async () => {
    await t.asUser(me, (tx) =>
      tx.query(`insert into public.transactions (date, type, amount_paise, account_id) values ('2026-10-03', 'expense', 12000, $1)`, [bank]),
    );
    await t.asUser(me, (tx) => tx.query('delete from public.import_batches where id = $1', [batchA]));
    expect(await count('select count(*)::int as n from public.transactions')).toBe(1);
    expect(await count("select count(*)::int as n from public.transactions where source = 'manual'")).toBe(1);
    // After undo, the same file can be imported again.
    const redo = await t.asUser(me, async (tx) => (await commit(tx, '00000000-0000-4000-8000-00000000000e', [row()])).rows[0]!.commit_import);
    expect(redo.added).toBe(1);
  });
});
