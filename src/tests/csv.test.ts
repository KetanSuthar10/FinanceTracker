import { describe, expect, it } from 'vitest';
import { transactionsToCsv } from '../domain/backup';

describe('transactionsToCsv', () => {
  const lookup = {
    accounts: [{ id: 'a', name: 'HDFC, Savings' }, { id: 'c', name: 'Card' }],
    categories: [{ id: 'g', name: 'Groceries' }],
    recipients: [{ id: 'r', name: '=HYPERLINK("http://evil")' }],
  };

  it('writes plain numbers, a spending effect, quoted text and neutralised formulas, oldest first', () => {
    const csv = transactionsToCsv(
      [
        { date: '2026-10-12', type: 'refund', amount_paise: 10000, account_id: 'c', to_account_id: null, category_id: 'g', recipient_id: null, note: 'said "thanks"', source: 'import' },
        { date: '2026-10-05', type: 'expense', amount_paise: 80050, account_id: 'a', to_account_id: null, category_id: 'g', recipient_id: 'r', note: null, source: 'voice' },
        { date: '2026-10-07', type: 'transfer', amount_paise: 30000, account_id: 'a', to_account_id: 'c', category_id: null, recipient_id: null, note: null, source: 'manual' },
      ],
      lookup,
    );
    expect(csv.split('\r\n')).toEqual([
      'Date,Type,Amount,Spending effect,Account,To account,Category,Name,Note,Entered by',
      `2026-10-05,expense,800.50,800.50,"HDFC, Savings",,Groceries,"'=HYPERLINK(""http://evil"")",,voice`,
      '2026-10-07,transfer,300.00,0.00,"HDFC, Savings",Card,,,,manual',
      '2026-10-12,refund,100.00,-100.00,Card,,Groceries,,"said ""thanks""",import',
      '',
    ]);
  });
});
