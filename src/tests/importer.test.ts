import { describe, expect, it } from 'vitest';
import {
  detectDateFormat,
  findHeaderRow,
  findHeaderRowForMapping,
  normalizeRows,
  parseStatementAmount,
  parseStatementDate,
  rowHashes,
  suggestMapping,
  suggestRecipient,
  type ColumnMapping,
  type Grid,
} from '../domain/importer';
import { buildReview, toPayload, type ExistingTransaction, type ReviewContext } from '../domain/importReview';

// A synthetic statement shaped like a typical Indian bank savings export:
// preamble rows, a header, debit/credit columns, a summary footer.
const BANK: Grid = [
  ['Synthetic Bank Ltd', '', '', '', '', '', ''],
  ['Account No :', 'XXXXXXXX1234', '', '', '', '', ''],
  ['Statement From : 01/10/2026 To : 31/10/2026', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
  ['01/10/26', 'NEFT CR-SYNTH0000001-ACME PAYROLL-SALARY OCT', '0000000000000001', '01/10/26', '', '5,000.00', '6,000.00'],
  ['03/10/26', 'UPI/DR/412345678901/THIRD WAVE COFFEE/YESB/twc@ybl/Payment', '0000412345678901', '03/10/26', '120.00', '', '5,880.00'],
  ['03/10/26', 'UPI/DR/412345678901/THIRD WAVE COFFEE/YESB/twc@ybl/Payment', '0000412345678901', '03/10/26', '120.00', '', '5,760.00'],
  ['07/10/26', 'CRED CLUB CC PAYMENT', '0000000000000003', '07/10/26', '300.00', '', '5,460.00'],
  ['08/10/26', 'ATM WDL SYNTH ATM 01', '0000000000000004', '08/10/26', '100.00', '', '5,360.00'],
  ['12/10/26', 'REFUND AMAZON ORDER', '0000000000000005', '12/10/26', '', '99.50', '5,459.50'],
  ['31/02/26', 'BROKEN DATE ROW', '0000000000000006', '', '10.00', '', ''],
  ['14/10/26', 'BOTH COLUMNS ROW', '0000000000000007', '', '10.00', '20.00', ''],
  ['', '', '', '', '', '', ''],
  ['', 'STATEMENT SUMMARY', '', '', '', '', ''],
];

const CARD: Grid = [
  ['Transaction Date', 'Details', 'Amount (INR)', 'Dr/Cr'],
  ['05-Oct-2026', 'SYNTH GROCERY MART BANGALORE', '800.00', 'Dr'],
  ['07-Oct-2026', 'PAYMENT RECEIVED - THANK YOU', '300.00', 'Cr'],
  ['12-Oct-2026', 'REFUND SYNTH GROCERY MART', '100.00', 'Cr'],
  ['14-Oct-2026', 'ANNUAL FEE', '20.00', 'Dr'],
];

describe('dates and amounts', () => {
  it.each([
    ['01/10/26', 'dmy', '2026-10-01'],
    ['01-10-2026', 'dmy', '2026-10-01'],
    ['01.10.2026', 'dmy', '2026-10-01'],
    ['10/01/2026', 'mdy', '2026-10-01'],
    ['2026-10-01', 'dmy', '2026-10-01'],
    ['05-Oct-2026', 'dmy', '2026-10-05'],
    ['5 Sept 2026', 'dmy', '2026-09-05'],
    ['Oct 05, 2026', 'dmy', '2026-10-05'],
    ['01/10/2026 14:22:10', 'dmy', '2026-10-01'],
    ['31/02/26', 'dmy', null],
    ['hello', 'dmy', null],
  ] as const)('%s (%s) → %s', (raw, fmt, expected) => {
    expect(parseStatementDate(raw, fmt)).toBe(expected);
  });

  it('detects day-first unless proven month-first', () => {
    expect(detectDateFormat(['01/10/26', '13/10/26'])).toBe('dmy');
    expect(detectDateFormat(['10/13/2026'])).toBe('mdy');
    expect(detectDateFormat(['01/02/2026'])).toBe('dmy');
  });

  it.each([
    ['1,20,000.50', { paise: 12000050, sign: 1, drcr: null }],
    ['₹ 450', { paise: 45000, sign: 1, drcr: null }],
    ['(120.00)', { paise: 12000, sign: -1, drcr: null }],
    ['-99', { paise: 9900, sign: -1, drcr: null }],
    ['1,200.00 Dr', { paise: 120000, sign: 1, drcr: 'dr' }],
    ['500 CR', { paise: 50000, sign: 1, drcr: 'cr' }],
    ['120.50000000000001', { paise: 12050, sign: 1, drcr: null }],
  ])('amount %s', (raw, expected) => {
    expect(parseStatementAmount(raw)).toEqual(expected);
  });

  it('blank is empty; junk and extra decimals are unreadable', () => {
    expect(parseStatementAmount('')).toBe('empty');
    expect(parseStatementAmount('-')).toBe('empty');
    expect(parseStatementAmount('abc')).toBeNull();
    expect(parseStatementAmount('1.234')).toBeNull();
  });
});

describe('bank statement with debit/credit columns', () => {
  const header = findHeaderRow(BANK);
  const guess = suggestMapping(BANK, header) as ColumnMapping;

  it('finds the header below the preamble and guesses the columns', () => {
    expect(header).toBe(4);
    expect(guess).toMatchObject({
      date: 'Date',
      description: 'Narration',
      amountStyle: 'debit_credit',
      debit: 'Withdrawal Amt.',
      credit: 'Deposit Amt.',
      reference: 'Chq./Ref.No.',
      dateFormat: 'dmy',
    });
  });

  it('reads every line: rows, errors with reasons, and ignored lines', () => {
    const r = normalizeRows(BANK, header, guess);
    expect(r.rows.map((x) => [x.date, x.amountPaise, x.direction])).toEqual([
      ['2026-10-01', 500000, 'in'],
      ['2026-10-03', 12000, 'out'],
      ['2026-10-03', 12000, 'out'],
      ['2026-10-07', 30000, 'out'],
      ['2026-10-08', 10000, 'out'],
      ['2026-10-12', 9950, 'in'],
    ]);
    expect(r.errors.map((e) => [e.line, e.reason])).toEqual([
      [12, 'Can\'t read the date "31/02/26"'],
      [13, 'Both debit and credit are filled in'],
    ]);
    expect(r.ignoredLines).toBe(2); // blank line + summary line without date or amount
    expect(r.rows.length + r.errors.length + r.ignoredLines).toBe(BANK.length - header - 1);
  });

  it('keeps two identical coffees as two rows with different fingerprints, and re-import gives the same ones', async () => {
    const r = normalizeRows(BANK, header, guess);
    const first = await rowHashes('acc-1', r.rows);
    const again = await rowHashes('acc-1', normalizeRows(BANK, header, guess).rows);
    expect(new Set(first).size).toBe(first.length);
    expect(again).toEqual(first);
    expect(await rowHashes('acc-2', r.rows)).not.toEqual(first);
  });

  it('finds the header again from a saved mapping even if the preamble changes', () => {
    const shifted = [['Another line'], ['And another'], ...BANK];
    expect(findHeaderRowForMapping(shifted, guess)).toBe(6);
  });
});

describe('card statement with an amount + Dr/Cr column', () => {
  const guess = suggestMapping(CARD, 0) as ColumnMapping;
  it('reads direction from the Dr/Cr column', () => {
    expect(guess).toMatchObject({ amountStyle: 'amount_drcr', amount: 'Amount (INR)', drcr: 'Dr/Cr', date: 'Transaction Date' });
    const r = normalizeRows(CARD, 0, guess);
    expect(r.rows.map((x) => [x.amountPaise, x.direction])).toEqual([
      [80000, 'out'],
      [30000, 'in'],
      [10000, 'in'],
      [2000, 'out'],
    ]);
  });

  it('a signed single amount column follows the chosen meaning of positive', () => {
    const grid: Grid = [['Date', 'Description', 'Amount'], ['01/10/2026', 'A', '-50'], ['02/10/2026', 'B', '70']];
    const asBank = normalizeRows(grid, 0, { date: 'Date', description: 'Description', amount: 'Amount', amountStyle: 'signed', positiveMeans: 'in', dateFormat: 'dmy' });
    expect(asBank.rows.map((r) => r.direction)).toEqual(['out', 'in']);
    const asCard = normalizeRows(grid, 0, { date: 'Date', description: 'Description', amount: 'Amount', amountStyle: 'signed', positiveMeans: 'out', dateFormat: 'dmy' });
    expect(asCard.rows.map((r) => r.direction)).toEqual(['in', 'out']);
  });
});

describe('suggestRecipient', () => {
  it.each([
    ['UPI/DR/412345678901/THIRD WAVE COFFEE/YESB/twc@ybl/Payment', 'Third Wave Coffee'],
    ['UPI-SWIGGY-swiggy@icici-ICIC0DC0099-412345678901-PAYMENT', 'Swiggy'],
    ['NEFT CR-SYNTH0000001-ACME PAYROLL-SALARY OCT', 'Acme Payroll'],
    ['POS 4111XXXXXXXX1111 DMART BANGALORE', 'Dmart Bangalore'],
    ['Amazon Pay India', 'Amazon Pay India'],
  ])('%s → %s', (raw, expected) => {
    expect(suggestRecipient(raw)).toBe(expected);
  });
});

describe('review statuses and defaults', () => {
  const accounts: ReviewContext['accounts'] = [
    { id: 'bank', type: 'bank', archived: false },
    { id: 'cash', type: 'cash', archived: false },
    { id: 'card', type: 'card', archived: false },
  ];
  const categories: ReviewContext['categories'] = [
    { id: 'food', name: 'Food & dining', kind: 'expense', archived: false },
    { id: 'groceries', name: 'Groceries', kind: 'expense', archived: false },
    { id: 'fees', name: 'Fees & interest', kind: 'expense', archived: false },
    { id: 'salary', name: 'Salary', kind: 'income', archived: false },
  ];
  const recipients = [{ id: 'twc', name: 'Third Wave Coffee', aliases: [], default_category_id: 'food' }];

  async function review(grid: Grid, header: number, accountId: string, existing: ExistingTransaction[]) {
    const mapping = suggestMapping(grid, header) as ColumnMapping;
    const { rows } = normalizeRows(grid, header, mapping);
    const hashes = await rowHashes(accountId, rows);
    const account = accounts.find((a) => a.id === accountId)!;
    return { rows: buildReview(rows, hashes, { account, accounts, defaultAccountId: 'bank', recipients, categories, existing }), hashes };
  }

  it('bank rows get sensible defaults', async () => {
    const { rows } = await review(BANK, 4, 'bank', []);
    expect(rows.map((r) => [r.status, r.type, r.counterAccountId, r.categoryId, r.recipientName])).toEqual([
      ['new', 'income', null, null, 'Acme Payroll'],
      ['new', 'expense', null, 'food', 'Third Wave Coffee'],
      ['new', 'expense', null, 'food', 'Third Wave Coffee'],
      ['new', 'transfer', 'card', null, ''],
      ['new', 'transfer', 'cash', null, ''],
      ['new', 'refund', null, null, 'Refund Amazon Order'],
    ]);
    expect(rows.every((r) => r.include)).toBe(true);
  });

  it('marks re-imported rows, and one manual entry is matched by only one of two equal rows', async () => {
    const first = await review(BANK, 4, 'bank', []);
    const manualCoffee: ExistingTransaction = { id: 'm1', date: '2026-10-02', type: 'expense', amount_paise: 12000, account_id: 'bank', to_account_id: null, import_hash: null };
    const importedSalary: ExistingTransaction = { id: 'i1', date: '2026-10-01', type: 'income', amount_paise: 500000, account_id: 'bank', to_account_id: null, import_hash: first.hashes[0]! };
    const { rows } = await review(BANK, 4, 'bank', [manualCoffee, importedSalary]);
    expect(rows.map((r) => r.status)).toEqual(['imported', 'possible', 'new', 'new', 'new', 'new']);
    expect(rows[1]!.matchId).toBe('m1');
    expect(rows[1]!.include).toBe(false); // possible duplicates default to skip
    expect(rows[2]!.include).toBe(true); // the second, genuine coffee is still imported
  });

  it('does not match a different direction, amount, or a date more than 3 days away', async () => {
    const existing: ExistingTransaction[] = [
      { id: 'a', date: '2026-10-03', type: 'income', amount_paise: 12000, account_id: 'bank', to_account_id: null, import_hash: null },
      { id: 'b', date: '2026-10-03', type: 'expense', amount_paise: 12100, account_id: 'bank', to_account_id: null, import_hash: null },
      { id: 'c', date: '2026-10-08', type: 'expense', amount_paise: 12000, account_id: 'bank', to_account_id: null, import_hash: null },
      { id: 'd', date: '2026-10-03', type: 'expense', amount_paise: 12000, account_id: 'cash', to_account_id: null, import_hash: null },
    ];
    const { rows } = await review(BANK, 4, 'bank', existing);
    expect(rows[1]!.status).toBe('new');
    expect(rows[2]!.status).toBe('new');
  });

  it('card statement: the payment row matches the bank→card transfer already recorded', async () => {
    const bankSideTransfer: ExistingTransaction = { id: 't1', date: '2026-10-07', type: 'transfer', amount_paise: 30000, account_id: 'bank', to_account_id: 'card', import_hash: 'from-bank-import' };
    const { rows } = await review(CARD, 0, 'card', [bankSideTransfer]);
    expect(rows.map((r) => [r.status, r.type, r.categoryId])).toEqual([
      ['new', 'expense', 'groceries'],
      ['possible', 'transfer', null],
      ['new', 'refund', 'groceries'],
      ['new', 'expense', 'fees'],
    ]);
    expect(rows[1]!.counterAccountId).toBe('bank');
  });

  it('payload puts transfers the right way round and refuses unfinished rows', async () => {
    const { rows } = await review(CARD, 0, 'card', []);
    const ok = toPayload(rows, 'card', recipients);
    expect(ok.ok && ok.rows.map((r) => [r.type, r.account_id, r.to_account_id, r.amount_paise])).toEqual([
      ['expense', 'card', null, 80000],
      ['transfer', 'bank', 'card', 30000], // money came INTO the card from the bank
      ['refund', 'card', null, 10000],
      ['expense', 'card', null, 2000],
    ]);

    const broken = rows.map((r, i) => (i === 1 ? { ...r, counterAccountId: null } : i === 2 ? { ...r, type: 'expense' as const } : r));
    const bad = toPayload(broken, 'card', recipients);
    expect(bad.ok ? [] : bad.problems.map((p) => p.line)).toEqual([3, 4]);
  });

  it('known recipients are linked by id; new names are passed for creation', async () => {
    const { rows } = await review(BANK, 4, 'bank', []);
    const result = toPayload(rows, 'bank', recipients);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows[1]).toMatchObject({ recipient_id: 'twc', recipient_name: null });
    expect(result.rows[0]).toMatchObject({ recipient_id: null, recipient_name: 'Acme Payroll' });
  });
});
