import { describe, expect, it } from 'vitest';
import { friendlyError } from '../data/db';
import { passwordSignInMessage, readSignInMethods } from '../features/auth/messages';

describe('email + password sign-in', () => {
  it('explains common errors in plain words', () => {
    expect(passwordSignInMessage('Invalid login credentials')).toBe('Wrong email or password.');
    expect(passwordSignInMessage('Email not confirmed')).toMatch(/Auto Confirm User/);
    expect(passwordSignInMessage('Email logins are disabled')).toMatch(/turn on the Email provider/);
    expect(passwordSignInMessage('TypeError: Failed to fetch')).toMatch(/internet connection/);
  });

  it('shows Google only when it is switched on in Supabase', () => {
    expect(readSignInMethods({ external: { email: true, google: false } })).toEqual({ email: true, google: false });
    expect(readSignInMethods({ external: { email: true, google: true } })).toEqual({ email: true, google: true });
    expect(readSignInMethods({ external: { email: false, google: true } })).toEqual({ email: false, google: true });
    expect(readSignInMethods(null)).toEqual({ email: true, google: false });
  });
});

describe('database not set up', () => {
  it('says to run the setup SQL instead of showing a raw error', () => {
    for (const err of [
      { code: 'PGRST205', message: "Could not find the table 'public.accounts' in the schema cache" },
      { code: 'PGRST202', message: 'Could not find the function public.account_totals' },
      { code: '42P01', message: 'relation "public.accounts" does not exist' },
    ]) {
      expect(friendlyError(err as never).message).toMatch(/database isn’t set up yet/);
    }
  });
});
