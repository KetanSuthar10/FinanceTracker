import type { PostgrestError } from '@supabase/supabase-js';
import { assertSafePaise } from '../lib/money';

/** Turns a database/network error into a sentence a person can act on. */
export function friendlyError(error: PostgrestError | Error | null | undefined, fallback = 'Something went wrong.'): Error {
  if (!error) return new Error(fallback);
  const code = 'code' in error ? error.code : undefined;
  const message = error.message ?? '';
  if (code === '23505') return new Error('That name is already used. Pick a different one.');
  if (code === '23503') return new Error("It's still used by other records, so it can't be removed. Archive it instead.");
  if (code === '23514') return new Error('Some values are not allowed. Check the form and try again.');
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883' || /schema cache/i.test(message)) {
    return new Error(
      'The database isn’t set up yet. In Supabase, run the setup SQL (supabase/finance-tracker-database-setup.sql) in the SQL Editor, then reload.',
    );
  }
  if (code === 'PGRST301' || /jwt|expired/i.test(message)) return new Error('Your session has expired. Sign in again.');
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return new Error("Can't reach the server. Check your internet connection and try again.");
  }
  return new Error(message || fallback);
}

/** Throws a friendly error if the call failed, otherwise returns its data. */
export function unwrap<T>(result: { data: T; error: PostgrestError | null }): NonNullable<T> {
  if (result.error) throw friendlyError(result.error);
  if (result.data === null || result.data === undefined) throw new Error('No data returned.');
  return result.data as NonNullable<T>;
}

/** Postgres BIGINT arrives as a JSON number; refuse anything that isn't a safe whole number. */
export function paise(value: unknown): number {
  return assertSafePaise(typeof value === 'string' ? Number(value) : value);
}

/**
 * Supabase returns at most 1,000 rows per request by default. This fetches page after page
 * so totals are never silently cut off.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw friendlyError(error);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
