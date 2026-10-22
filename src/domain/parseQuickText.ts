/**
 * Turns a typed or spoken sentence like "450 groceries from hdfc yesterday" into a DRAFT.
 * The draft is always shown in the form for confirmation; nothing is saved from here.
 * Rule: never invent a value. Anything unclear stays empty and is listed in `missing`.
 * Examples and rules: docs/MONEY_RULES.md → "Quick text / voice parsing".
 */
import { addDays, addMonths, isValidISODate } from '../lib/dates';
import { numberWordsToDigits } from './numberWords';
import { findRecipient, normalizeName, toDisplayName } from './recipients';
import {
  categoryKindFor,
  type Account,
  type Category,
  type Recipient,
  type TransactionType,
} from './types';

export interface ParseContext {
  today: string;
  accounts: Pick<Account, 'id' | 'name' | 'nickname' | 'type' | 'archived'>[];
  defaultAccountId: string | null;
  recipients: Recipient[];
  categories: Pick<Category, 'id' | 'name' | 'kind' | 'archived'>[];
}

export type DraftField = 'amount' | 'account' | 'toAccount' | 'category';

export interface QuickDraft {
  type: TransactionType;
  amountPaise: number | null;
  date: string;
  accountId: string | null;
  toAccountId: string | null;
  /** Display name: a remembered recipient's name, or the words typed. '' when none. */
  recipientName: string;
  recipientId: string | null;
  categoryId: string | null;
  note: string;
  /** Fields the person still has to fill in or confirm. */
  missing: DraftField[];
  /** Short human-readable hints, e.g. "More than one number — check the amount." */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Day N of this month, or of last month if that day is still in the future. */
function dayOfMonthOnOrBefore(today: string, day: number): string | null {
  if (day < 1 || day > 31) return null;
  const thisMonth = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
  if (isValidISODate(thisMonth) && thisMonth <= today) return thisMonth;
  const lastMonth = addMonths(`${today.slice(0, 8)}01`, -1, day);
  return Number(lastMonth.slice(8)) === day ? lastMonth : null;
}

function extractDate(text: string, today: string, hasOtherNumber: (without: string) => boolean) {
  const rules: { re: RegExp; resolve: (m: RegExpExecArray) => string | null }[] = [
    { re: /\bday before yesterday\b/, resolve: () => addDays(today, -2) },
    { re: /\byesterday\b/, resolve: () => addDays(today, -1) },
    { re: /\btoday\b/, resolve: () => today },
    {
      re: new RegExp(`\\b(?:on |last )?(${WEEKDAYS.join('|')})\\b`),
      resolve: (m) => {
        const target = WEEKDAYS.indexOf(m[1]!);
        const back = (weekdayOf(today) - target + 7) % 7;
        return addDays(today, -back);
      },
    },
    {
      // 5/10, 05-10-2026, 5/10/26 (day first, Indian style)
      re: /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?\b/,
      resolve: (m) => {
        const day = Number(m[1]);
        const month = Number(m[2]);
        let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
        if (year < 100) year += 2000;
        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (!isValidISODate(iso)) return null;
        // Without a year, a date later than today means last year.
        if (!m[3] && iso > today) return `${year - 1}${iso.slice(4)}`;
        return iso;
      },
    },
    { re: /\b(?:on )?(\d{1,2})(?:st|nd|rd|th)\b/, resolve: (m) => dayOfMonthOnOrBefore(today, Number(m[1])) },
  ];

  for (const { re, resolve } of rules) {
    const m = re.exec(text);
    if (!m) continue;
    const date = resolve(m);
    if (date) return { date, text: text.replace(m[0], ' ') };
  }

  // "on 5" (no suffix) is only a date when another number is the amount: "120 cafe on 5".
  const plain = /\bon (\d{1,2})\b/.exec(text);
  if (plain) {
    const without = text.replace(plain[0], ' ');
    const date = dayOfMonthOnOrBefore(today, Number(plain[1]));
    if (date && hasOtherNumber(without)) return { date, text: without };
  }
  return { date: today, text };
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------
const AMOUNT_RE =
  /(?<![\p{L}\d.])(₹\s*|rs\.?\s*|inr\s*)?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?\s*(k|thousand|lakhs?|lacs?|l)?(?![\p{L}\d])(\s*(?:rupees|rupee|rs|inr|bucks)\b)?/gu;

const MULTIPLIER: Record<string, number> = { k: 1_000, thousand: 1_000 };

function multiplierFor(word: string | undefined): number {
  if (!word) return 1;
  if (word in MULTIPLIER) return MULTIPLIER[word]!;
  return 100_000; // lakh, lakhs, lac, lacs, l
}

/** Exact integer conversion: "1.5" × 1000 rupees → 150000 paise. Returns null if not a whole paise amount. */
function toPaise(whole: string, fraction: string, multiplier: number): number | null {
  const digits = whole.replace(/,/g, '');
  const scale = 10 ** fraction.length;
  const numerator = (Number(digits) * scale + Number(fraction || '0')) * multiplier * 100;
  if (numerator % scale !== 0) return null;
  const paise = numerator / scale;
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

function extractAmount(text: string) {
  const matches = [...text.matchAll(AMOUNT_RE)];
  if (matches.length === 0) return { amountPaise: null, text, ambiguous: false };

  // Prefer an amount that is clearly money (₹, rs, k, lakh, "rupees"); otherwise the first number.
  const marked = matches.filter((m) => m[1] || m[4] || m[5]);
  const chosen = marked[0] ?? matches[0]!;
  const fraction = chosen[3] ?? '';
  const multiplier = multiplierFor(chosen[4]);
  const amountPaise = multiplier === 1 && fraction.length > 2 ? null : toPaise(chosen[2]!, fraction, multiplier);

  return {
    amountPaise,
    text: text.replace(chosen[0], ' '),
    ambiguous: marked.length !== 1 && matches.length > 1,
  };
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------
const CARD_BILL_RE = /\b(?:credit card bill|card bill|cc bill|card payment|paid (?:the )?(?:credit )?card)\b/;
const WITHDRAW_RE = /\b(?:withdrew|withdraw|withdrawal|withdrawn|atm)\b/;
const TRANSFER_RE = /\b(?:transfer|transferred|moved|move)\b/;
const REFUND_RE = /\b(?:refund|refunded|reversal|reversed)\b/;
const INCOME_RE = /\b(?:got|received|receive|credited|earned|income|salary|bonus|freelance)\b/;

function detectType(text: string): { type: TransactionType; cardBill: boolean; withdraw: boolean } {
  const cardBill = CARD_BILL_RE.test(text);
  const withdraw = WITHDRAW_RE.test(text);
  if (cardBill || withdraw || TRANSFER_RE.test(text)) return { type: 'transfer', cardBill, withdraw };
  if (REFUND_RE.test(text)) return { type: 'refund', cardBill, withdraw };
  if (INCOME_RE.test(text)) return { type: 'income', cardBill, withdraw };
  return { type: 'expense', cardBill, withdraw };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
type ParseAccount = ParseContext['accounts'][number];

interface AccountMention {
  start: number; // token index
  length: number; // tokens used
  accountId: string | null; // null = ambiguous (e.g. "card" with two cards)
}

const TYPE_WORDS: Record<string, ParseAccount['type']> = {
  cash: 'cash',
  card: 'card',
  'credit card': 'card',
  cc: 'card',
  bank: 'bank',
};

function findAccountMentions(tokens: string[], accounts: ParseAccount[]): AccountMention[] {
  const active = accounts.filter((a) => !a.archived);
  const byKey = new Map<string, Set<string>>();
  const addKey = (key: string, id: string) => {
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key)!.add(id);
  };
  for (const a of active) {
    const name = normalizeName(a.name);
    addKey(name, a.id);
    if (a.nickname) addKey(normalizeName(a.nickname), a.id);
    const first = name.split(' ')[0] ?? '';
    if (first.length >= 3 && first !== name) addKey(first, a.id);
  }

  const mentions: AccountMention[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (const length of [3, 2, 1]) {
      const phrase = tokens.slice(i, i + length).join(' ');
      if (tokens.length < i + length) continue;
      const ids = byKey.get(phrase);
      const typeWord = TYPE_WORDS[phrase];
      let accountId: string | null | undefined;
      if (ids) {
        accountId = ids.size === 1 ? [...ids][0]! : null;
      } else if (typeWord) {
        const ofType = active.filter((a) => a.type === typeWord);
        if (ofType.length === 0) continue;
        accountId = ofType.length === 1 ? ofType[0]!.id : null;
      } else {
        continue;
      }
      mentions.push({ start: i, length, accountId });
      i += length - 1;
      break;
    }
  }
  return mentions;
}

function onlyAccountOfType(accounts: ParseAccount[], type: ParseAccount['type']): string | null {
  const ofType = accounts.filter((a) => !a.archived && a.type === type);
  return ofType.length === 1 ? ofType[0]!.id : null;
}

// ---------------------------------------------------------------------------
// Leftover words → recipient
// ---------------------------------------------------------------------------
const FILLER = new Set([
  'spent', 'spend', 'paid', 'pay', 'bought', 'buy', 'on', 'for', 'at', 'to', 'from', 'via', 'using', 'by',
  'with', 'in', 'the', 'a', 'an', 'my', 'of', 'rupees', 'rupee', 'rs', 'inr', 'bucks', 'upi', 'gpay',
  'googlepay', 'phonepe', 'paytm', 'bhim', 'neft', 'imps', 'rtgs', 'netbanking', 'online', 'debit',
  'got', 'received', 'receive', 'credited', 'earned', 'income', 'refund', 'refunded', 'reversal', 'reversed',
  'transfer', 'transferred', 'moved', 'move', 'withdrew', 'withdraw', 'withdrawal', 'withdrawn', 'atm',
  'payment', 'credit', 'expense', 'today', 'yesterday', 'and',
]);

function stem(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

/** A category whose name (or first word) matches one of the words: "groceries" → Groceries, "fee" → Fees & interest. */
export function guessCategory(text: string, categories: ParseContext['categories'], kind: Category['kind']) {
  return categoryFromWords(normalizeName(text).split(' ').filter(Boolean), categories, kind);
}

function categoryFromWords(words: string[], categories: ParseContext['categories'], kind: Category['kind']) {
  const stems = new Set(words.map(stem));
  return categories.find((c) => {
    if (c.archived || c.kind !== kind) return false;
    const name = normalizeName(c.name);
    const first = name.split(' ')[0] ?? '';
    return stems.has(stem(name)) || stems.has(stem(first));
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export function parseQuickText(input: string, ctx: ParseContext): QuickDraft {
  const warnings: string[] = [];
  let text = ` ${numberWordsToDigits(input.toLowerCase().replace(/\s+/g, ' ').trim())} `;

  const dateResult = extractDate(text, ctx.today, (rest) => /\d/.test(rest));
  text = dateResult.text;

  const amountResult = extractAmount(text);
  text = amountResult.text;
  if (amountResult.ambiguous) warnings.push('More than one number — check the amount.');

  const { type, cardBill, withdraw } = detectType(text);

  // Tokenise what's left (keep '&' for names like "M&S").
  const tokens = normalizeName(text).split(' ').filter(Boolean);
  const mentions = findAccountMentions(tokens, ctx.accounts);
  const used = new Set<number>();
  for (const m of mentions) for (let i = 0; i < m.length; i++) used.add(m.start + i);

  const defaultAccount = ctx.accounts.find((a) => a.id === ctx.defaultAccountId && !a.archived)?.id ?? null;
  let accountId: string | null;
  let toAccountId: string | null = null;
  let accountAmbiguous = false;

  if (type === 'transfer') {
    const toIndex = tokens.indexOf('to');
    const before = mentions.filter((m) => toIndex === -1 || m.start < toIndex);
    const after = toIndex === -1 ? [] : mentions.filter((m) => m.start > toIndex);
    let from = before[0];
    let to = after[0];
    if (!to && toIndex === -1 && before.length >= 2) {
      from = before[0];
      to = before[1];
    }
    if (!to && (cardBill || withdraw) && before.length === 1) {
      // "paid card bill 8000" / "withdrew 2000 cash": the one mention is the destination.
      const only = before[0]!;
      const onlyType = ctx.accounts.find((a) => a.id === only.accountId)?.type;
      if ((cardBill && onlyType === 'card') || (withdraw && onlyType === 'cash')) {
        to = only;
        from = undefined;
      }
    }
    toAccountId = to?.accountId ?? null;
    if (!to) {
      if (cardBill) toAccountId = onlyAccountOfType(ctx.accounts, 'card');
      else if (withdraw) toAccountId = onlyAccountOfType(ctx.accounts, 'cash');
    }
    accountId = from ? from.accountId : defaultAccount !== toAccountId ? defaultAccount : null;
    if (from && from.accountId === null) accountAmbiguous = true;
  } else {
    const first = mentions[0];
    if (first) {
      accountId = first.accountId;
      accountAmbiguous = first.accountId === null;
    } else {
      accountId = defaultAccount;
    }
  }
  if (accountAmbiguous) warnings.push('Which account? More than one matches.');

  // What's left is the recipient. Income words like "salary" are deliberately not fillers:
  // they are also the natural recipient name.
  const words = tokens.filter((t, i) => !used.has(i) && !FILLER.has(t));

  let recipientName = '';
  let recipientId: string | null = null;
  let categoryId: string | null = null;
  let note = '';
  const kind = categoryKindFor(type);

  if (type === 'transfer') {
    note = words.filter((w) => !['bill', 'cc', 'card'].includes(w)).join(' ');
  } else if (words.length > 0) {
    const phrase = words.join(' ');
    const known = findRecipient(phrase, ctx.recipients);
    if (known) {
      recipientName = known.name;
      recipientId = known.id;
      const remembered = ctx.categories.find((c) => c.id === known.default_category_id && !c.archived);
      if (remembered && remembered.kind === kind) categoryId = remembered.id;
    } else {
      // Recover the words as typed, so "DMart" stays "DMart".
      const typed = new Map<string, string>();
      for (const word of input.replace(/[^\p{L}\p{N}\s&]/gu, ' ').split(/\s+/)) {
        if (word && !typed.has(word.toLowerCase())) typed.set(word.toLowerCase(), word);
      }
      recipientName = toDisplayName(words.map((w) => typed.get(w) ?? w).join(' '));
    }
    if (!categoryId && kind) categoryId = categoryFromWords(words, ctx.categories, kind)?.id ?? null;
  }

  const missing: DraftField[] = [];
  if (amountResult.amountPaise === null) missing.push('amount');
  if (!accountId) missing.push('account');
  if (type === 'transfer' && !toAccountId) missing.push('toAccount');
  if (type !== 'transfer' && !categoryId) missing.push('category');

  return {
    type,
    amountPaise: amountResult.amountPaise,
    date: dateResult.date,
    accountId,
    toAccountId,
    recipientName,
    recipientId,
    categoryId,
    note,
    missing,
    warnings,
  };
}
