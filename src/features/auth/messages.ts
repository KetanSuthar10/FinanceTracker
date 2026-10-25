/** Turns Supabase's email + password sign-in errors into plain language. */
export function passwordSignInMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(message)) {
    return 'This account isn’t confirmed yet. In Supabase, open Authentication → Users and confirm it, or create it again with “Auto Confirm User” ticked.';
  }
  if (/email logins are disabled|provider is not enabled/i.test(message)) {
    return 'Email sign-in is turned off. In Supabase, turn on the Email provider under Authentication → Sign In / Providers.';
  }
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a minute and try again.';
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  return message || 'Sign-in didn’t work.';
}

/** Which sign-in methods are switched on in Supabase. Read from the public auth settings. */
export interface SignInMethods {
  email: boolean;
  google: boolean;
}

export function readSignInMethods(settings: unknown): SignInMethods {
  const external = (settings as { external?: Record<string, unknown> } | null)?.external ?? {};
  return { email: external.email !== false, google: external.google === true };
}
