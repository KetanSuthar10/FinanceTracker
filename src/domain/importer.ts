/**
 * Bank / card statement import — pure logic (no React, no Supabase).
 * File → grid of strings → column mapping → normalised rows (or row errors) → hashes.
 * Rules: docs/MONEY_RULES.md → "Import duplicate rules". Nothing is ever silently dropped:
 * every non-empty line is either a row, an error with a reason, or counted as a non-transaction line.
 */
import { isValidISODate } from '../lib/dates';
import { normalizeName } from './recipients';

export type Grid = string[][];
export type DateFormat = 'dmy' | 'mdy' | 'ymd';
export type AmountStyle = 'debit_credit' | 'signed' | 'amount_drcr';
export type Direction = 'in' | 'out';

/** Saved per account. Columns are stored by header text so next month's file can have extra rows above. */
export interface ColumnMapping {
  date: string;
  description: string;
  amountStyle: AmountStyle;
  debit?: string;
  credit?: string;
  amount?: string;
  drcr?: string;
  /** For 'signed': what a positive number means in this file. */
  positiveMeans?: Direction;
  reference?: string;
  dateFormat: DateFormat;
}

export interface ParsedRow {
  /** 1-based line number in the file, for messages. */
  line: number;
  date: string;
  description: string;
  reference: string;
  amountPaise: number;
  direction: Direction;
}

export interface RowError {
  line: number;
  reason: string;
  text: string;
}

export interface NormalizeResult {
  rows: ParsedRow[];
  errors: RowError[];
  /** Blank lines and lines with neither a date nor an amount (opening balance, totals, footers). */
  ignoredLines: number;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------
const clean = (v: string | undefined) => (v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const value = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISODate(value) ? value : null;
}

/** Reads a statement date. Times after the date are ignored. Returns null if it is not a real date. */
export function parseStatementDate(raw: string, format: DateFormat): string | null {
  const text = clean(raw).toLowerCase().replace(/[t\s]\d{1,2}:\d{2}(:\d{2})?(\s?[ap]m)?.*$/, '').trim();
  if (!text) return null;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[-/. ]([a-z]{3,9})[-/., ]+(\d{2}|\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[2]!.slice(0, m[2]!.startsWith('sept') ? 4 : 3)];
    return month ? iso(Number(m[3]), month, Number(m[1])) : null;
  }

  m = /^([a-z]{3,9})[ -](\d{1,2}),?[ -](\d{2}|\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[1]!.slice(0, 3)];
    return month ? iso(Number(m[3]), month, Number(m[2])) : null;
  }

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (format === 'mdy') return iso(y, a, b);
    if (format === 'dmy') return iso(y, b, a);
  }
  return null;
}

/** Day-first unless a sample proves month-first (second number > 12). Indian banks are day-first. */
export function detectDateFormat(samples: string[]): DateFormat {
  let dmy = false;
  let mdy = false;
  for (const s of samples) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(clean(s));
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  return mdy && !dmy ? 'mdy' : 'dmy';
}

export interface ParsedAmount {
  paise: number;
  /** -1 for a minus sign or brackets, 1 otherwise. */
  sign: -1 | 1;
  drcr: 'dr' | 'cr' | null;
}

/**
 * Reads amounts like "1,20,000.50", "₹ 450", "(120.00)", "-99", "1,200.00 Dr", "500 CR".
 * Returns 'empty' for a blank cell and null for anything unreadable. Never rounds: more than 2 decimals is unreadable.
 */
export function parseStatementAmount(raw: string): ParsedAmount | 'empty' | null {
  let text = clean(raw).toLowerCase();
  if (!text || text === '-' || text === '--') return 'empty';
  let drcr: ParsedAmount['drcr'] = null;
  const suffix = /\s*\b(dr|cr|debit|credit)\.?$/.exec(text);
  if (suffix) {
    drcr = suffix[1]!.startsWith('d') ? 'dr' : 'cr';
    text = text.slice(0, suffix.index).trim();
  }
  let sign: 1 | -1 = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  text = text.replace(/^(₹|rs\.?|inr)\s*/, '').replace(/,/g, '').replace(/\s/g, '');
  if (text.startsWith('-')) {
    sign = -1;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) {
    // Spreadsheets sometimes store 120.5 as 120.50000000000001 — only accept if it's exactly paise.
    const extra = /^(\d+)\.(\d{2})0{6,}\d?$/.exec(text);
    if (!extra) return null;
    return { paise: Number(extra[1]) * 100 + Number(extra[2]), sign, drcr };
  }
  const paise = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(paise)) return null;
  return { paise, sign, drcr };
}

// ---------------------------------------------------------------------------
// Header + mapping detection
// ---------------------------------------------------------------------------
const DESC_RE = /narration|description|particulars|details|remarks|transaction remarks|merchant/i;

/** Index of the header row: the first of the first 40 rows naming a date and a description column. */
export function findHeaderRow(grid: Grid): number {
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const cells = grid[i]!.map(clean);
    if (cells.some((c) => /date/i.test(c)) && cells.some((c) => DESC_RE.test(c))) return i;
  }
  return -1;
}

/** Finds the header row that contains every column a saved mapping needs. */
export function findHeaderRowForMapping(grid: Grid, mapping: ColumnMapping): number {
  const needed = mappingColumns(mapping).map((c) => c.toLowerCase());
  for (let i = 0; i < Math.min(grid.length, 60); i++) {
    const cells = new Set(grid[i]!.map((c) => clean(c).toLowerCase()));
    if (needed.every((n) => cells.has(n))) return i;
  }
  return -1;
}

export function mappingColumns(m: ColumnMapping): string[] {
  const cols = [m.date, m.description];
  if (m.amountStyle === 'debit_credit') cols.push(m.debit ?? '', m.credit ?? '');
  else cols.push(m.amount ?? '');
  if (m.amountStyle === 'amount_drcr') cols.push(m.drcr ?? '');
  if (m.reference) cols.push(m.reference);
  return cols;
}

function pick(headers: string[], ...patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const hit = headers.find((h) => p.test(h));
    if (hit) return hit;
  }
  return undefined;
}

/** Best guess at the column mapping from header names and sample data. The person confirms it. */
export function suggestMapping(grid: Grid, headerRow: number): Partial<ColumnMapping> {
  const headers = (grid[headerRow] ?? []).map(clean).filter(Boolean);
  const date = pick(headers, /^(txn|tran|transaction|posting)\.? ?date/i, /^date$/i, /^date\b/i, /date/i);
  const description = pick(headers, /narration/i, /description/i, /particulars/i, /details/i, /remarks/i, /merchant/i);
  const debit = pick(headers, /withdrawal/i, /^debit/i, /\bdebit\b/i, /^dr\.?\b/i, /money out|paid out/i);
  const credit = pick(headers, /deposit/i, /^credit/i, /\bcredit\b/i, /^cr\.?\b/i, /money in|paid in/i);
  const amount = pick(headers, /^(transaction )?amount/i, /amount/i);
  const drcr = pick(headers, /dr ?\/ ?cr|cr ?\/ ?dr|debit ?\/ ?credit/i, /^type$/i);
  const reference = pick(headers, /ref/i, /chq|cheque/i, /utr/i);

  const dateIndex = date ? (grid[headerRow] ?? []).map(clean).indexOf(date) : -1;
  const samples = grid.slice(headerRow + 1, headerRow + 40).map((r) => r[dateIndex] ?? '');
  const dateFormat = detectDateFormat(samples);

  let amountStyle: AmountStyle | undefined;
  if (debit && credit && debit !== credit) amountStyle = 'debit_credit';
  else if (amount && drcr && amount !== drcr) amountStyle = 'amount_drcr';
  else if (amount) amountStyle = 'signed';

  return { date, description, amountStyle, debit, credit, amount, drcr, reference, dateFormat, positiveMeans: 'in' };
}

// ---------------------------------------------------------------------------
// Normalising rows
// ---------------------------------------------------------------------------
export function normalizeRows(grid: Grid, headerRow: number, mapping: ColumnMapping): NormalizeResult {
  const headers = (grid[headerRow] ?? []).map((h) => clean(h).toLowerCase());
  const col = (name?: string) => (name ? headers.indexOf(name.toLowerCase()) : -1);
  const c = {
    date: col(mapping.date),
    description: col(mapping.description),
    debit: col(mapping.debit),
    credit: col(mapping.credit),
    amount: col(mapping.amount),
    drcr: col(mapping.drcr),
    reference: col(mapping.reference),
  };

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  let ignoredLines = 0;

  for (let i = headerRow + 1; i < grid.length; i++) {
    const cells = grid[i]!;
    const line = i + 1;
    const get = (index: number) => (index >= 0 ? clean(cells[index]) : '');
    const text = cells.map(clean).filter(Boolean).join(' | ');
    if (!text) {
      ignoredLines++;
      continue;
    }

    const dateRaw = get(c.date);
    const amountCells =
      mapping.amountStyle === 'debit_credit' ? [get(c.debit), get(c.credit)] : [get(c.amount)];
    const hasAmount = amountCells.some((v) => parseStatementAmount(v) !== 'empty');

    if (!dateRaw && !hasAmount) {
      ignoredLines++;
      continue;
    }

    const date = parseStatementDate(dateRaw, mapping.dateFormat);
    if (!date) {
      // A repeated header or a "Statement summary" line has no date but often has words in the amount columns.
      errors.push({ line, reason: dateRaw ? `Can't read the date "${dateRaw}"` : 'No date', text });
      continue;
    }

    let amountPaise: number;
    let direction: Direction;

    if (mapping.amountStyle === 'debit_credit') {
      const debit = parseStatementAmount(get(c.debit));
      const credit = parseStatementAmount(get(c.credit));
      if (debit === null || credit === null) {
        errors.push({ line, reason: "Can't read the amount", text });
        continue;
      }
      const d = debit === 'empty' ? 0 : debit.paise;
      const cr = credit === 'empty' ? 0 : credit.paise;
      if (d > 0 && cr > 0) {
        errors.push({ line, reason: 'Both debit and credit are filled in', text });
        continue;
      }
      if (d === 0 && cr === 0) {
        errors.push({ line, reason: 'No amount', text });
        continue;
      }
      amountPaise = d || cr;
      direction = d > 0 ? 'out' : 'in';
    } else {
      const parsed = parseStatementAmount(get(c.amount));
      if (parsed === null || parsed === 'empty' || parsed.paise === 0) {
        errors.push({ line, reason: parsed === 'empty' || (parsed && parsed.paise === 0) ? 'No amount' : "Can't read the amount", text });
        continue;
      }
      amountPaise = parsed.paise;
      if (mapping.amountStyle === 'amount_drcr') {
        const flag = get(c.drcr).toLowerCase();
        if (/^(dr|d|debit|db|withdrawal)\.?$/.test(flag)) direction = 'out';
        else if (/^(cr|c|credit|deposit)\.?$/.test(flag)) direction = 'in';
        else if (parsed.drcr) direction = parsed.drcr === 'dr' ? 'out' : 'in';
        else {
          errors.push({ line, reason: `Can't tell if "${get(c.drcr)}" means money in or out`, text });
          continue;
        }
      } else if (parsed.drcr) {
        direction = parsed.drcr === 'dr' ? 'out' : 'in';
      } else {
        const positive = parsed.sign === 1;
        const positiveMeans = mapping.positiveMeans ?? 'in';
        direction = positive === (positiveMeans === 'in') ? 'in' : 'out';
      }
    }

    rows.push({
      line,
      date,
      description: get(c.description),
      reference: get(c.reference),
      amountPaise,
      direction,
    });
  }

  return { rows, errors, ignoredLines };
}

// ---------------------------------------------------------------------------
// Fingerprints
// ---------------------------------------------------------------------------
/**
 * Stable identity for each row: account + date + amount + direction + description + occurrence.
 * The occurrence number keeps two genuine identical rows in one file apart (two ₹120 coffees).
 */
export function rowKeys(accountId: string, rows: ParsedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [accountId, r.date, r.amountPaise, r.direction, normalizeName(r.description), r.reference.toLowerCase()].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}|${n}`;
  });
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function rowHashes(accountId: string, rows: ParsedRow[]): Promise<string[]> {
  return Promise.all(rowKeys(accountId, rows).map(sha256Hex));
}

// ---------------------------------------------------------------------------
// Recipient name from bank narrations
// ---------------------------------------------------------------------------
const NOISE = new Set([
  'upi', 'dr', 'cr', 'p2a', 'p2m', 'payment', 'paid', 'neft', 'imps', 'rtgs', 'ach', 'nach', 'ecs', 'pos', 'atm',
  'mb', 'ib', 'inb', 'via', 'to', 'from', 'transfer', 'trf', 'txn', 'ref', 'na', 'null', 'collect', 'request', 'debit',
  'credit', 'card', 'purchase', 'mmt', 'bil', 'onl', 'billpay', 'sent', 'using', 'others', 'other', 'upiintent', 'yono',
]);

/**
 * Suggests a readable name from a narration such as
 * "UPI/DR/412345678901/THIRD WAVE COFFEE/YESB/twc@ybl/Payment" → "Third Wave Coffee".
 * It's only a suggestion shown in the review screen.
 */
export function suggestRecipient(description: string): string {
  const text = clean(description);
  if (!text) return '';
  const parts = text.split(/[/|\\]|(?<=\S)-(?=\S)|\s{2,}|:/).map((p) => p.trim()).filter(Boolean);
  const candidates = parts.filter((p) => {
    const lower = p.toLowerCase();
    if (p.includes('@')) return false; // UPI handle
    if (/^\d[\d\s]*$/.test(p)) return false; // reference numbers
    if (/^[a-z]{4}0[a-z0-9]{6}$/i.test(p)) return false; // IFSC code
    if (/^[A-Z]{3,4}$/.test(p) && !/^(ola|kfc|pvr|ikea|zara|dmart)$/i.test(p)) return false; // bank codes like YESB, HDFC
    if (/^x+\d+$/i.test(p) || /\d{6,}/.test(p.replace(/\s/g, ''))) return false; // masked accounts, long refs
    const words = lower.split(/\s+/).filter((w) => !NOISE.has(w));
    return words.length > 0 && /[a-z]{2,}/.test(words.join(' '));
  });
  const best = candidates[0] ?? text;
  const words = best.split(/\s+/).filter((w) => !NOISE.has(w.toLowerCase()) && !/\d{5,}/.test(w) && !/^[\dx*]{8,}$/i.test(w));
  const name = (words.length ? words : best.split(/\s+/)).join(' ').slice(0, 60).trim();
  // Statements shout in capitals; show names in title case.
  return name === name.toUpperCase() ? name.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, s: string, l: string) => s + l.toUpperCase()) : name;
}

/** Card-bill payments made from a bank account (e.g. CRED, autopay). */
export const CARD_PAYMENT_RE = /credit ?card|cc ?pay|card ?payment|cred club|cred\b|autopay|card bill|billdesk.*card/i;
/** Payment received on a card statement. */
export const CARD_RECEIVED_RE = /payment|thank you|received|autopay|neft|imps|upi|bbps/i;
export const REFUND_RE = /refund|reversal|reversed|\brev\b|cashback/i;
export const INTEREST_RE = /\bint(erest)?\b.*(pd|paid|credit|cr)|interest/i;
