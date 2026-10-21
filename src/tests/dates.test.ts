import { describe, expect, it } from 'vitest';
import { addDays, addMonths, isValidISODate, monthRange, todayIST } from '../lib/dates';

describe('dates', () => {
  it('uses India time for today, not UTC', () => {
    // 20:00 UTC on 21 Oct is already 22 Oct in India (UTC+5:30)
    expect(todayIST(new Date('2026-10-21T20:00:00Z'))).toBe('2026-10-22');
    expect(todayIST(new Date('2026-10-21T18:00:00Z'))).toBe('2026-10-21');
  });

  it('rejects impossible dates', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2026-02-31')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('21/10/2026')).toBe(false);
  });

  it('computes month ranges and moves days/months', () => {
    expect(monthRange('2026-10-21')).toEqual({ from: '2026-10-01', through: '2026-10-31' });
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', through: '2028-02-29' });
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-11-05', 2)).toBe('2027-01-05');
  });
});
