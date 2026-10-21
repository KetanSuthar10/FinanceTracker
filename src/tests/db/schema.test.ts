import { beforeAll, describe, expect, it } from 'vitest';
import type { Transaction } from '@electric-sql/pglite';
import { computePositions, type AccountTotals } from '../../domain/balances';
import { FIXTURE_ACCOUNTS, FIXTURE_OPENING_DATE, FIXTURE_TRANSACTIONS } from '../fixture';
import { createTestDb, type TestDb } from './testDb';

let t: TestDb;
let alice: string;
let bob: string;
const accountIds: Record<string, string> = {};

async function insertAccount(tx: Transaction, name: string, type: string, opening: number, openingDate: string) {
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.accounts (name, type, opening_balance_paise, opening_date)
     values ($1, $2, $3, $4) returning id`,
    [name, type, opening, openingDate],
  );
  return rows[0]!.id;
}

async function totals(tx: Transaction, before: string | null = null): Promise<AccountTotals[]> {
  const { rows } = await tx.query<AccountTotals>('select * from public.account_totals($1)', [before]);
  return rows.map((r) => ({
    account_id: r.account_id,
    income_in_paise: Number(r.income_in_paise),
    refund_in_paise: Number(r.refund_in_paise),
    expense_out_paise: Number(r.expense_out_paise),
    transfer_in_paise: Number(r.transfer_in_paise),
    transfer_out_paise: Number(r.transfer_out_paise),
  }));
}

const fixtureAccounts = () =>
  FIXTURE_ACCOUNTS.map((a) => ({ id: accountIds[a.key]!, type: a.type, opening_balance_paise: a.opening_balance_paise }));

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser('alice@example.com');
  bob = await t.createUser('bob@example.com');

  await t.asUser(alice, async (tx) => {
    await tx.query('select public.ensure_starter_data()');
    const { rows: cats } = await tx.query<{ id: string; name: string }>('select id, name from public.categories');
    const categoryId = new Map(cats.map((c) => [c.name, c.id]));

    for (const a of FIXTURE_ACCOUNTS) {
      accountIds[a.key] = await insertAccount(tx, a.name, a.type, a.opening_balance_paise, FIXTURE_OPENING_DATE);
    }
    for (const row of FIXTURE_TRANSACTIONS) {
      await tx.query(
        `insert into public.transactions (date, type, amount_paise, account_id, to_account_id, category_id, note)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          row.date,
          row.type,
          row.amount_paise,
          accountIds[row.account],
          row.to ? accountIds[row.to] : null,
          row.category ? categoryId.get(row.category) : null,
          row.note,
        ],
      );
    }
  });
}, 60_000);

describe('reference fixture (docs/MONEY_RULES.md)', () => {
  it('gives the documented balances for October', async () => {
    const result = await t.asUser(alice, async (tx) => computePositions(fixtureAccounts(), await totals(tx)));

    expect(result.balances.get(accountIds.bankA!)).toBe(619000);
    expect(result.balances.get(accountIds.bankB!)).toBe(5000);
    expect(result.balances.get(accountIds.cash!)).toBe(24000);
    expect(result.balances.get(accountIds.cardC!)).toBe(-42000);
    expect(result.moneyInHandPaise).toBe(648000);
    expect(result.cardOutstandingPaise).toBe(42000);
    expect(result.netPositionPaise).toBe(606000);
  });

  it('carries earlier activity into a period opening (5–31 Oct starts at ₹5,780)', async () => {
    const opening = await t.asUser(alice, async (tx) =>
      computePositions(fixtureAccounts(), await totals(tx, '2026-10-05')),
    );
    expect(opening.netPositionPaise).toBe(578000);
  });

  it('ignores transactions dated before an account was opened', async () => {
    await t.asUser(alice, async (tx) => {
      const id = await insertAccount(tx, 'New wallet', 'cash', 50000, '2026-10-15');
      await tx.query(
        `insert into public.transactions (date, type, amount_paise, account_id) values
           ('2026-10-10', 'expense', 1000, $1), ('2026-10-20', 'expense', 2000, $1)`,
        [id],
      );
      const rows = await totals(tx);
      expect(rows.find((r) => r.account_id === id)?.expense_out_paise).toBe(2000);
      throw new RollbackSignal();
    }).catch(ignoreRollback);
  });
});

describe('starter data', () => {
  it('seeds 18 categories once and is safe to call again', async () => {
    const count = await t.asUser(alice, async (tx) => {
      await tx.query('select public.ensure_starter_data()');
      const { rows } = await tx.query<{ n: number }>('select count(*)::int as n from public.categories');
      return rows[0]!.n;
    });
    expect(count).toBe(18);
  });
});

describe('privacy between users (row-level security)', () => {
  it("does not show one user's rows to another", async () => {
    const counts = await t.asUser(bob, async (tx) => {
      const a = await tx.query('select * from public.accounts');
      const tr = await tx.query('select * from public.transactions');
      const tot = await tx.query('select * from public.account_totals()');
      return [a.rows.length, tr.rows.length, tot.rows.length];
    });
    expect(counts).toEqual([0, 0, 0]);
  });

  it("cannot attach a transaction to someone else's account", async () => {
    await expect(
      t.asUser(bob, (tx) =>
        tx.query(
          `insert into public.transactions (date, type, amount_paise, account_id) values ('2026-10-20', 'expense', 100, $1)`,
          [accountIds.bankA],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('cannot create rows that claim to belong to someone else', async () => {
    await expect(
      t.asUser(bob, (tx) =>
        tx.query(
          `insert into public.accounts (user_id, name, type, opening_date) values ($1, 'Sneaky', 'bank', '2026-10-01')`,
          [alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot change or delete someone else's rows", async () => {
    const affected = await t.asUser(bob, async (tx) => {
      const u = await tx.query(`update public.accounts set name = 'Hacked' where id = $1`, [accountIds.bankA]);
      const d = await tx.query(`delete from public.transactions`);
      return [u.affectedRows, d.affectedRows];
    });
    expect(affected).toEqual([0, 0]);
  });

  it('gives signed-out visitors no access at all', async () => {
    await expect(t.asAnon((tx) => tx.query('select * from public.accounts'))).rejects.toThrow(/permission denied/);
    await expect(t.asAnon((tx) => tx.query('select * from public.account_totals()'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('transaction rules enforced by the database', () => {
  const insert = (sql: string, params: unknown[]) => t.asUser(alice, (tx) => tx.query(sql, params));
  const base = `insert into public.transactions (date, type, amount_paise, account_id, to_account_id) values`;

  it('rejects a transfer without a destination', async () => {
    await expect(insert(`${base} ('2026-10-20', 'transfer', 100, $1, null)`, [accountIds.bankA])).rejects.toThrow(
      /check constraint/,
    );
  });

  it('rejects a transfer to the same account', async () => {
    await expect(
      insert(`${base} ('2026-10-20', 'transfer', 100, $1, $1)`, [accountIds.bankA]),
    ).rejects.toThrow(/check constraint/);
  });

  it('rejects zero, negative and unsafe amounts', async () => {
    for (const amount of [0, -100, '9007199254740992']) {
      await expect(
        insert(`${base} ('2026-10-20', 'expense', $2, $1, null)`, [accountIds.bankA, amount]),
      ).rejects.toThrow(/check constraint/);
    }
  });

  it('rejects impossible dates', async () => {
    await expect(
      insert(`${base} ('2026-02-31', 'expense', 100, $1, null)`, [accountIds.bankA]),
    ).rejects.toThrow(/date/);
  });

  it('will not delete an account that still has transactions', async () => {
    await expect(insert('delete from public.accounts where id = $1', [accountIds.bankA])).rejects.toThrow(
      /foreign key/,
    );
  });

  it('stores the same imported row only once per account', async () => {
    await expect(
      t.asUser(alice, async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `insert into public.import_batches (account_id, file_name, row_count, added_count, skipped_count)
           values ($1, 'oct.csv', 2, 2, 0) returning id`,
          [accountIds.bankA],
        );
        const sql = `insert into public.transactions (date, type, amount_paise, account_id, source, import_batch_id, import_hash)
                     values ('2026-10-20', 'expense', 100, $1, 'import', $2, 'same-hash')`;
        await tx.query(sql, [accountIds.bankA, rows[0]!.id]);
        await tx.query(sql, [accountIds.bankA, rows[0]!.id]);
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});

class RollbackSignal extends Error {}
function ignoreRollback(error: unknown) {
  if (!(error instanceof RollbackSignal)) throw error;
}
