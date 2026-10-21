import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseConfig =
  | { ok: true; url: string; key: string }
  | { ok: false; problem: string };

/**
 * Validates the two public Supabase values. There is deliberately no fallback:
 * if they are missing or wrong, the app shows a setup screen instead of guessing.
 */
export function readSupabaseConfig(rawUrl: string | undefined, rawKey: string | undefined): SupabaseConfig {
  const url = rawUrl?.trim() ?? '';
  const key = rawKey?.trim() ?? '';

  if (!url || !key) {
    return { ok: false, problem: 'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, problem: 'VITE_SUPABASE_URL is not a valid URL.' };
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    return { ok: false, problem: 'VITE_SUPABASE_URL must start with https://' };
  }
  if (/your-project|example|placeholder/i.test(url) || /your-|placeholder/i.test(key)) {
    return { ok: false, problem: 'The Supabase settings still contain placeholder text.' };
  }

  // Refuse secret keys outright — they must never reach a browser.
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    return {
      ok: false,
      problem: 'A secret (service role) key was supplied. Use the publishable key instead, and rotate the secret key.',
    };
  }
  if (!key.startsWith('sb_publishable_') && jwtRole(key) !== 'anon') {
    return { ok: false, problem: 'VITE_SUPABASE_PUBLISHABLE_KEY does not look like a Supabase publishable key.' };
  }

  return { ok: true, url: url.replace(/\/+$/, ''), key };
}

/** Reads the role from a legacy JWT-style key, if it is one. */
function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export const supabaseConfig = readSupabaseConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

export const supabase: SupabaseClient | null = supabaseConfig.ok
  ? createClient(supabaseConfig.url, supabaseConfig.key, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** For code that only runs after the configuration check has passed. */
export function getSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
