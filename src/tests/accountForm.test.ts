import { describe, expect, it } from 'vitest';
import { accountToForm, validateAccountForm, type AccountFormValues } from '../domain/accountForm';

const base: AccountFormValues = {
  name: ' HDFC  Savings ',
  type: 'bank',
  openingAmountText: '15,000.50',
  openingIsNegative: false,
  openingDate: '2026-10-01',
  nickname: 'hdfc',
  cardDueDay: '5',
};

describe('validateAccountForm', () => {
  it('stores a bank balance as positive paise and ignores the due day', () => {
    const r = validateAccountForm(base);
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'HDFC Savings',
        type: 'bank',
        opening_balance_paise: 1500050,
        opening_date: '2026-10-01',
        nickname: 'hdfc',
        card_due_day: null,
      },
    });
  });

  it('stores card debt as a negative balance', () => {
    const r = validateAccountForm({ ...base, type: 'card', openingAmountText: '420' });
    expect(r.ok && r.value).toMatchObject({ opening_balance_paise: -42000, card_due_day: 5 });
  });

  it('allows an overdrawn bank balance and a zero opening', () => {
    const r = validateAccountForm({ ...base, openingIsNegative: true, openingAmountText: '100' });
    expect(r.ok && r.value.opening_balance_paise).toBe(-10000);
    const zero = validateAccountForm({ ...base, openingAmountText: '' });
    expect(zero.ok && zero.value.opening_balance_paise).toBe(0);
  });

  it('reports problems per field', () => {
    const r = validateAccountForm({ ...base, name: ' ', openingAmountText: 'abc', openingDate: '2026-02-30', type: 'card', cardDueDay: '40' });
    expect(r.ok ? {} : Object.keys(r.errors).sort()).toEqual(['cardDueDay', 'name', 'openingAmountText', 'openingDate']);
  });

  it('round-trips through accountToForm', () => {
    const r = validateAccountForm({ ...base, type: 'card', openingAmountText: '420.05' });
    if (!r.ok) throw new Error('expected valid');
    const again = validateAccountForm(accountToForm(r.value));
    expect(again.ok && again.value).toEqual(r.value);
  });
});
