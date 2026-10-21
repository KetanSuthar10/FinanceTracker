import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from '../lib/supabase';

const URL_OK = 'https://abcdefghijklmnop.supabase.co';
const KEY_OK = 'sb_publishable_AbCdEf1234567890';
const fakeJwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role }))}.signature`;

describe('readSupabaseConfig', () => {
  it('accepts a real-looking URL and publishable key', () => {
    expect(readSupabaseConfig(URL_OK, KEY_OK)).toEqual({ ok: true, url: URL_OK, key: KEY_OK });
    expect(readSupabaseConfig(`${URL_OK}/`, fakeJwt('anon')).ok).toBe(true);
  });

  it('fails closed when values are missing or placeholders', () => {
    expect(readSupabaseConfig(undefined, undefined).ok).toBe(false);
    expect(readSupabaseConfig(URL_OK, '').ok).toBe(false);
    expect(readSupabaseConfig('https://your-project.supabase.co', KEY_OK).ok).toBe(false);
    expect(readSupabaseConfig('not a url', KEY_OK).ok).toBe(false);
    expect(readSupabaseConfig('http://abc.supabase.co', KEY_OK).ok).toBe(false);
  });

  it('refuses secret keys so they can never be shipped to a browser', () => {
    const secret = readSupabaseConfig(URL_OK, 'sb_secret_AbCdEf1234567890');
    expect(secret.ok).toBe(false);
    expect(readSupabaseConfig(URL_OK, fakeJwt('service_role')).ok).toBe(false);
  });
});
