import { describe, expect, it } from 'vitest';
import { formatINR, parseRupeesToPaise } from '../lib/money';

describe('parseRupeesToPaise', () => {
  it.each([
    ['120', 12000],
    ['120.5', 12050],
    ['120.05', 12005],
    ['1,20,000', 12000000],
    ['1,200,000.75', 120000075],
    ['₹ 450', 45000],
    ['Rs. 99', 9900],
    ['0.01', 1],
  ])('parses %s', (input, expected) => {
    expect(parseRupeesToPaise(input)).toBe(expected);
  });

  it.each(['', 'abc', '0', '-5', '1.234', '12e3', '1..2', '99999999999999999'])('rejects %s', (input) => {
    expect(parseRupeesToPaise(input)).toBeNull();
  });
});

describe('formatINR', () => {
  it('uses Indian grouping and hides zero paise', () => {
    expect(formatINR(12000)).toBe('₹120');
    expect(formatINR(12000050)).toBe('₹1,20,000.50');
    expect(formatINR(-42000)).toBe('−₹420');
    expect(formatINR(5, { alwaysShowPaise: true })).toBe('₹0.05');
  });

  it('refuses non-integer paise', () => {
    expect(() => formatINR(1.5)).toThrow();
  });
});
