/**
 * Money is always integer paise. These helpers convert at the edges only.
 * See docs/MONEY_RULES.md.
 */

export const MAX_SAFE_PAISE = Number.MAX_SAFE_INTEGER;

export function isSafePaise(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertSafePaise(value: unknown, label = 'amount'): number {
  if (!isSafePaise(value)) {
    throw new Error(`Invalid ${label}: expected a whole number of paise, got ${String(value)}`);
  }
  return value;
}

/**
 * Parses a rupee amount typed by a person into paise, without floating point.
 * Accepts "120", "120.5", "120.50", "1,20,000", "1,200,000.75", "₹ 450", "rs 99".
 * Returns null for anything that is not a clean, positive amount with at most 2 decimals.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^(₹|rs\.?|inr)\s*/, '')
    .replace(/,/g, '');

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;

  const rupees = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const paise = Number(rupees) * 100 + Number(fraction);

  if (!Number.isSafeInteger(paise) || paise <= 0) return null;
  return paise;
}

const rupeeFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/**
 * Formats paise as Indian rupees: 12000050 -> "₹1,20,000.50", 12000 -> "₹120".
 * Negative values get a leading minus: "−₹420".
 */
export function formatINR(paise: number, options: { alwaysShowPaise?: boolean } = {}): string {
  assertSafePaise(paise);
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const remainder = abs % 100;
  const showPaise = options.alwaysShowPaise || remainder !== 0;
  const body = rupeeFormatter.format(rupees) + (showPaise ? `.${String(remainder).padStart(2, '0')}` : '');
  return `${paise < 0 ? '−' : ''}₹${body}`;
}

/** 12050 -> "120.50", 12000 -> "120" — for pre-filling an amount input. */
export function paiseToInputText(paise: number): string {
  assertSafePaise(paise);
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const rest = abs % 100;
  return `${paise < 0 ? '-' : ''}${rupees}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}
