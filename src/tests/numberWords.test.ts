import { describe, expect, it } from 'vitest';
import { numberWordsToDigits } from '../domain/numberWords';
import { parseQuickText, type ParseContext } from '../domain/parseQuickText';

describe('numberWordsToDigits', () => {
  it.each([
    ['spent two hundred on lunch', 'spent 200 on lunch'],
    ['two hundred fifty petrol', '250 petrol'],
    ['one thousand five hundred and fifty petrol', '1550 petrol'],
    ['got fifty thousand salary', 'got 50000 salary'],
    ['one lakh twenty thousand rent', '120000 rent'],
    ['two lakhs car', '200000 car'],
    ['a hundred chai', '100 chai'],
    ['twenty five rupees chai', '25 rupees chai'],
    ['ten rupees chai', '10 rupees chai'],
    ['fifty parking', '50 parking'],
  ])('%s → %s', (input, expected) => {
    expect(numberWordsToDigits(input)).toBe(expected);
  });

  it.each(['one coffee 120', 'oneplus charger 999', 'paid one friend 300', 'and then', 'a coffee'])('leaves "%s" alone', (input) => {
    expect(numberWordsToDigits(input)).toBe(input);
  });
});

describe('spoken amounts in quick add', () => {
  const ctx: ParseContext = {
    today: '2026-10-22',
    accounts: [{ id: 'bank', name: 'HDFC', nickname: null, type: 'bank', archived: false }],
    defaultAccountId: 'bank',
    recipients: [],
    categories: [{ id: 'rent', name: 'Rent', kind: 'expense', archived: false }],
  };

  it('fills the amount and keeps the rest', () => {
    expect(parseQuickText('one lakh twenty thousand rent', ctx)).toMatchObject({ amountPaise: 12_000_000, recipientName: 'Rent', categoryId: 'rent' });
    expect(parseQuickText('spent two hundred and fifty on lunch yesterday', ctx)).toMatchObject({ amountPaise: 25_000, date: '2026-10-21', recipientName: 'Lunch' });
  });

  it('"one coffee 120" still takes 120 and does not warn', () => {
    const d = parseQuickText('one coffee 120', ctx);
    expect(d.amountPaise).toBe(12_000);
    expect(d.warnings).toEqual([]);
  });
});

describe('digits with Indian unit words are left for the amount reader', () => {
  it.each(['2 lakh car', '1.25 lakh', '5 thousand rent'])('leaves "%s" alone', (input) => {
    expect(numberWordsToDigits(input)).toBe(input);
  });
});
