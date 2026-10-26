import { describe, expect, it } from 'vitest';
import { parseQuickText, type ParseContext } from '../domain/parseQuickText';

// Wednesday 21 October 2026
const TODAY = '2026-10-21';

const accounts: ParseContext['accounts'] = [
  { id: 'hdfc', name: 'HDFC Savings', nickname: null, type: 'bank', archived: false },
  { id: 'sbi', name: 'SBI', nickname: 'salary account', type: 'bank', archived: false },
  { id: 'wallet', name: 'Wallet', nickname: null, type: 'cash', archived: false },
  { id: 'icici-card', name: 'ICICI Amazon Pay', nickname: 'amazon card', type: 'card', archived: false },
  { id: 'old', name: 'Old Axis', nickname: null, type: 'bank', archived: true },
];

const categories: ParseContext['categories'] = [
  { id: 'food', name: 'Food & dining', kind: 'expense', archived: false },
  { id: 'groceries', name: 'Groceries', kind: 'expense', archived: false },
  { id: 'rent', name: 'Rent', kind: 'expense', archived: false },
  { id: 'fuel', name: 'Fuel', kind: 'expense', archived: false },
  { id: 'shopping', name: 'Shopping', kind: 'expense', archived: false },
  { id: 'salary', name: 'Salary', kind: 'income', archived: false },
  { id: 'freelance', name: 'Freelance', kind: 'income', archived: false },
];

const ctx: ParseContext = {
  today: TODAY,
  accounts,
  defaultAccountId: 'hdfc',
  recipients: [
    { id: 'twc', name: 'Third Wave Coffee', aliases: ['twc', 'third wave'], default_category_id: 'food' },
    { id: 'amz', name: 'Amazon', aliases: [], default_category_id: 'shopping' },
  ],
  categories,
};

const parse = (text: string, overrides: Partial<ParseContext> = {}) => parseQuickText(text, { ...ctx, ...overrides });

describe('parseQuickText — examples from MONEY_RULES.md', () => {
  it('120 cafe upi', () => {
    const d = parse('120 cafe upi');
    expect(d).toMatchObject({
      type: 'expense',
      amountPaise: 12000,
      date: TODAY,
      accountId: 'hdfc', // default account; "upi" is a payment method, not an account
      recipientName: 'Cafe',
      categoryId: null,
    });
    expect(d.missing).toEqual(['category']);
  });

  it('spent 450 on groceries from hdfc yesterday', () => {
    expect(parse('spent 450 on groceries from hdfc yesterday', { defaultAccountId: 'sbi' })).toMatchObject({
      type: 'expense',
      amountPaise: 45000,
      date: '2026-10-20',
      accountId: 'hdfc',
      recipientName: 'Groceries',
      categoryId: 'groceries',
      missing: [],
    });
  });

  it('got 50000 salary / received 50k salary', () => {
    for (const text of ['got 50000 salary', 'received 50k salary']) {
      expect(parse(text)).toMatchObject({
        type: 'income',
        amountPaise: 5_000_000,
        recipientName: 'Salary',
        categoryId: 'salary',
      });
    }
  });

  it('1.5k petrol card — the only card', () => {
    expect(parse('1.5k petrol card')).toMatchObject({
      type: 'expense',
      amountPaise: 150_000,
      accountId: 'icici-card',
      recipientName: 'Petrol',
    });
  });

  it('card with two cards is left for the user', () => {
    const twoCards = [...accounts, { id: 'hdfc-card', name: 'HDFC Regalia', nickname: null, type: 'card' as const, archived: false }];
    const d = parse('1.5k petrol card', { accounts: twoCards });
    expect(d.accountId).toBeNull();
    expect(d.missing).toContain('account');
    expect(d.warnings.join(' ')).toMatch(/which account/i);
  });

  it('₹1,20,000 rent', () => {
    expect(parse('₹1,20,000 rent')).toMatchObject({
      type: 'expense',
      amountPaise: 12_000_000,
      recipientName: 'Rent',
      categoryId: 'rent',
    });
  });

  it('refund 500 amazon — remembered recipient and category', () => {
    expect(parse('refund 500 amazon')).toMatchObject({
      type: 'refund',
      amountPaise: 50_000,
      recipientName: 'Amazon',
      recipientId: 'amz',
      categoryId: 'shopping',
    });
  });

  it('transfer 2000 hdfc to cash', () => {
    expect(parse('transfer 2000 hdfc to cash')).toMatchObject({
      type: 'transfer',
      amountPaise: 200_000,
      accountId: 'hdfc',
      toAccountId: 'wallet',
      categoryId: null,
      missing: [],
    });
  });

  it('withdrew 2000 — goes to the cash account, from the default account', () => {
    expect(parse('withdrew 2000')).toMatchObject({ type: 'transfer', accountId: 'hdfc', toAccountId: 'wallet' });
  });

  it('withdrew 2000 with no default account leaves "from" empty', () => {
    const d = parse('withdrew 2000', { defaultAccountId: null });
    expect(d.accountId).toBeNull();
    expect(d.missing).toEqual(['account']);
  });

  it('paid card bill 8000', () => {
    expect(parse('paid card bill 8000')).toMatchObject({
      type: 'transfer',
      amountPaise: 800_000,
      accountId: 'hdfc',
      toAccountId: 'icici-card',
    });
  });

  it('coffee — never invents an amount', () => {
    const d = parse('coffee');
    expect(d.amountPaise).toBeNull();
    expect(d.missing).toContain('amount');
  });
});

describe('parseQuickText — details', () => {
  it('uses recipient memory through aliases', () => {
    expect(parse('240 twc')).toMatchObject({ recipientName: 'Third Wave Coffee', recipientId: 'twc', categoryId: 'food' });
  });

  it('does not apply an expense memory to income', () => {
    expect(parse('got 300 amazon').categoryId).toBeNull();
  });

  it('understands account nicknames and archived accounts are ignored', () => {
    expect(parse('100 snacks amazon card').accountId).toBe('icici-card');
    expect(parse('100 snacks old axis').accountId).toBe('hdfc');
  });

  it('leaves the account empty when there is no default', () => {
    const d = parse('99 tea', { defaultAccountId: null });
    expect(d.accountId).toBeNull();
    expect(d.missing).toContain('account');
  });

  it.each([
    ['rs 99 tea', 9900],
    ['99 rupees tea', 9900],
    ['99.5 tea', 9950],
    ['2 lakh car', 20_000_000],
    ['1.25 lakh', 12_500_000],
    ['2l laptop', 20_000_000],
  ])('amount: %s', (text, paise) => {
    expect(parse(text).amountPaise).toBe(paise);
  });

  it('rejects amounts with more than 2 decimals instead of rounding', () => {
    expect(parse('12.345 tea').amountPaise).toBeNull();
  });

  it('prefers the clearly-marked amount and warns when unsure', () => {
    expect(parse('2 coffees ₹240').amountPaise).toBe(24000);
    const d = parse('2 coffees 240');
    expect(d.amountPaise).toBe(200);
    expect(d.warnings.join(' ')).toMatch(/check the amount/i);
  });

  it.each([
    ['500 dinner day before yesterday', '2026-10-19'],
    ['500 dinner yesterday', '2026-10-20'],
    ['500 dinner on monday', '2026-10-19'],
    ['500 dinner wednesday', '2026-10-21'],
    ['500 dinner on 5th', '2026-10-05'],
    ['500 dinner on 25th', '2026-09-25'],
    ['500 dinner on 5', '2026-10-05'],
    ['500 dinner 3/10', '2026-10-03'],
    ['500 dinner 15/12', '2025-12-15'],
    ['500 dinner 05-08-2026', '2026-08-05'],
  ])('date: %s', (text, date) => {
    const d = parse(text);
    expect(d.date).toBe(date);
    expect(d.amountPaise).toBe(50000);
    expect(d.recipientName).toBe('Dinner');
  });

  it('keeps the person\'s own capitalisation for new recipients', () => {
    expect(parse('450 DMart').recipientName).toBe('DMart');
  });

  it('puts leftover words of a transfer into the note', () => {
    expect(parse('transfer 500 hdfc to sbi for rent share')).toMatchObject({
      accountId: 'hdfc',
      toAccountId: 'sbi',
      note: 'rent share',
    });
  });
});

describe('parseQuickText — transfer notes', () => {
  it('does not leave "bill" or "card" behind as a note', () => {
    expect(parseQuickText('paid card bill 300', ctx).note).toBe('');
  });
});

describe('long spoken sentences (up to 10+ words)', () => {
  it('splits category words from the shop name', () => {
    const d = parse('paid four hundred fifty rupees for groceries at dmart yesterday from hdfc');
    expect(d).toMatchObject({ type: 'expense', amountPaise: 45000, date: '2026-10-20', accountId: 'hdfc', categoryId: 'groceries' });
    expect(d.recipientName).toBe('Dmart');
    expect(parse('i spent 1200 on fuel at the indian oil pump today using amazon card')).toMatchObject({
      amountPaise: 120000,
      accountId: 'icici-card',
      recipientName: 'Indian Oil Pump',
      categoryId: 'fuel',
    });
  });

  it('understands spoken day numbers when they are clearly dates', () => {
    expect(parse('got my salary of fifty thousand in sbi on the first of this month')).toMatchObject({
      type: 'income',
      amountPaise: 5_000_000,
      date: '2026-10-01',
      accountId: 'sbi',
      recipientName: 'Salary',
    });
    expect(parse('paid rent of eighteen thousand rupees to the landlord from hdfc on the twenty second of last month')).toMatchObject({
      amountPaise: 1_800_000,
      date: '2026-09-22',
      recipientName: 'Landlord',
      categoryId: 'rent',
    });
    expect(parse('first time at the new cafe spent 200').date).toBe(TODAY);
  });

  it('finds a remembered recipient inside a longer sentence and keeps the rest as a note', () => {
    expect(parse('bought shoes worth 2500 from amazon using the amazon card last sunday')).toMatchObject({
      amountPaise: 250000,
      date: '2026-10-18',
      accountId: 'icici-card',
      recipientId: 'amz',
      categoryId: 'shopping',
      note: 'shoes',
    });
    expect(parse('had coffee at third wave for 320 with friends on the fifth')).toMatchObject({
      amountPaise: 32000,
      date: '2026-10-05',
      recipientId: 'twc',
      note: 'coffee friends',
    });
  });

  it('long transfers still find both accounts', () => {
    expect(parse('transferred two thousand from hdfc savings to my wallet for cash yesterday')).toMatchObject({
      type: 'transfer',
      amountPaise: 200000,
      accountId: 'hdfc',
      toAccountId: 'wallet',
    });
  });
});
