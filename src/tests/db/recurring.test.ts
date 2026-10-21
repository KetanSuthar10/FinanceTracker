import { beforeAll, describe, expect, it } from 'vitest';
import type { Transaction } from '@electric-sql/pglite';
import { createTestDb, type TestDb } from './testDb';

let t: TestDb;
let me: string;
let other: string;
let bank: string;
let card: string;

async function newItem(tx: Transaction, over: Record<string, unknown> = {}) {
  const v = { name: 'Phone EMI', type: 'expense', amount_paise: 20000, day_of_month: 31, next_due_date: '2026-01-31', instalments_left: 2, ...over };
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.recurring_items (name, type, amount_paise, account_id, to_account_id, day_of_month, next_due_date, instalments_left)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [v.name, v.type, v.amount_paise, bank, v.type === 'transfer' ? card : null, v.day_of_month, v.next_due_date, v.instalments_left],
  );
  return rows[0]!.id;
}

const payment = (date: string) => ({ date, type: 'expense', amount_paise: 20000, account_id: bank, note: 'EMI' });

beforeAll(async () => {
  t = await createTestDb();
  me = await t.createUser('me@example.com');
  other = await t.createUser('other@example.com');
  await t.asUser(me, async (tx) => {
    const a = await tx.query<{ id: string }>(
      `insert into public.accounts (name, type, opening_date) values ('Bank', 'bank', '2026-01-01'), ('Card', 'card', '2026-01-01') returning id`,
    );
    bank = a.rows[0]!.id;
    card = a.rows[1]!.id;
  });
}, 60_000);

describe('pay_recurring', () => {
  it('saves the payment and moves the reminder on, clamping to month end, and finishes an EMI', async () => {
    const result = await t.asUser(me, async (tx) => {
      const id = await newItem(tx);
      const txId = (await tx.query<{ pay_recurring: string }>('select public.pay_recurring($1, $2, $3)', [id, '2026-01-31', payment('2026-01-31')]))
        .rows[0]!.pay_recurring;
      const afterFirst = (await tx.query('select next_due_date::text, instalments_left, active from public.recurring_items where id = $1', [id])).rows[0];
      await tx.query('select public.pay_recurring($1, $2, $3)', [id, '2026-02-28', payment('2026-02-28')]);
      const afterSecond = (await tx.query('select next_due_date::text, instalments_left, active from public.recurring_items where id = $1', [id])).rows[0];
      const saved = (await tx.query('select source, recurring_item_id from public.transactions where id = $1', [txId])).rows[0];
      return { afterFirst, afterSecond, saved, id };
    });
    expect(result.afterFirst).toEqual({ next_due_date: '2026-02-28', instalments_left: 1, active: true });
    expect(result.afterSecond).toEqual({ next_due_date: '2026-03-31', instalments_left: 0, active: false });
    expect(result.saved).toEqual({ source: 'recurring', recurring_item_id: result.id });
  });

  it('refuses to record the same occurrence twice (double tap / two devices)', async () => {
    const id = await t.asUser(me, (tx) => newItem(tx, { name: 'Rent', instalments_left: null, day_of_month: 5, next_due_date: '2026-03-05' }));
    await t.asUser(me, (tx) => tx.query('select public.pay_recurring($1, $2, $3)', [id, '2026-03-05', payment('2026-03-05')]));
    await expect(
      t.asUser(me, (tx) => tx.query('select public.pay_recurring($1, $2, $3)', [id, '2026-03-05', payment('2026-03-05')])),
    ).rejects.toThrow(/already recorded/);
    const count = await t.asUser(me, async (tx) =>
      Number((await tx.query<{ n: number }>('select count(*)::int as n from public.transactions where recurring_item_id = $1', [id])).rows[0]!.n),
    );
    expect(count).toBe(1);
  });

  it('writes nothing if the payment itself is invalid', async () => {
    const id = await t.asUser(me, (tx) => newItem(tx, { name: 'Gym', instalments_left: null, day_of_month: 10, next_due_date: '2026-03-10' }));
    await expect(
      t.asUser(me, (tx) => tx.query('select public.pay_recurring($1, $2, $3)', [id, '2026-03-10', { ...payment('2026-03-10'), amount_paise: 0 }])),
    ).rejects.toThrow(/check constraint/);
    const due = await t.asUser(me, async (tx) => (await tx.query<{ d: string }>('select next_due_date::text as d from public.recurring_items where id = $1', [id])).rows[0]!.d);
    expect(due).toBe('2026-03-10');
  });

  it("cannot pay or see another user's reminder", async () => {
    const id = await t.asUser(me, (tx) => newItem(tx, { name: 'Netflix', instalments_left: null, day_of_month: 15, next_due_date: '2026-03-15' }));
    await expect(
      t.asUser(other, (tx) => tx.query('select public.pay_recurring($1, $2, $3)', [id, '2026-03-15', payment('2026-03-15')])),
    ).rejects.toThrow(/not found/);
  });
});

describe('skip_recurring', () => {
  it('moves the date on without using up an EMI instalment', async () => {
    const row = await t.asUser(me, async (tx) => {
      const id = await newItem(tx, { name: 'Skip me', day_of_month: 20, next_due_date: '2026-04-20', instalments_left: 5 });
      await tx.query('select public.skip_recurring($1, $2)', [id, '2026-04-20']);
      return (await tx.query('select next_due_date::text, instalments_left from public.recurring_items where id = $1', [id])).rows[0];
    });
    expect(row).toEqual({ next_due_date: '2026-05-20', instalments_left: 5 });
  });
});
