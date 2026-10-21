import type { Recipient } from './types';

/** Lowercase, collapse spaces, drop punctuation — for comparing names typed or spoken in different ways. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Finds a remembered recipient by name or alias (case- and punctuation-insensitive). */
export function findRecipient(text: string, recipients: Recipient[]): Recipient | undefined {
  const key = normalizeName(text);
  if (!key) return undefined;
  return recipients.find(
    (r) => normalizeName(r.name) === key || r.aliases.some((alias) => normalizeName(alias) === key),
  );
}

/** "third wave coffee" -> "Third Wave Coffee" for new recipients created from quick text. */
export function toDisplayName(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed !== trimmed.toLowerCase()) return trimmed; // keep the user's own capitalisation
  return trimmed.replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase());
}

/** Parses an aliases field typed as "twc, third wave" into a clean, de-duplicated list. */
export function parseAliases(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(',')) {
    const alias = normalizeName(part);
    if (alias && !seen.has(alias)) {
      seen.add(alias);
      out.push(alias);
    }
  }
  return out;
}
