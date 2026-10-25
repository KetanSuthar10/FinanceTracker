import { useEffect, useState, type FormEvent } from 'react';
import { IndianRupee } from 'lucide-react';
import { Button } from '../../components/Button';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Field, TextInput } from '../../components/form';
import { ThemeToggle } from '../../components/ThemeToggle';
import { supabaseConfig } from '../../lib/supabase';
import { useAuth } from './authContext';
import { readSignInMethods, type SignInMethods } from './messages';

/** Supabase sends errors back on the URL (query or hash) after a failed Google sign-in. */
function readRedirectError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const message = params.get('error_description') ?? hash.get('error_description');
  if (!message) return null;
  if (/signup|sign.?ups? not allowed/i.test(message)) {
    return 'This Google account is not allowed to use this app.';
  }
  return message.replace(/\+/g, ' ');
}

/** Shows the Google button only when Google sign-in is switched on in Supabase. */
function useSignInMethods(): SignInMethods {
  const [methods, setMethods] = useState<SignInMethods>({ email: true, google: false });
  useEffect(() => {
    if (!supabaseConfig.ok) return;
    let active = true;
    fetch(`${supabaseConfig.url}/auth/v1/settings`, { headers: { apikey: supabaseConfig.key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => active && json && setMethods(readSignInMethods(json)))
      .catch(() => undefined); // Offline or blocked: keep email + password, which is always shown.
    return () => {
      active = false;
    };
  }, []);
  return methods;
}

export function SignInPage() {
  const { signInWithGoogle, signInWithPassword } = useAuth();
  const methods = useSignInMethods();
  const [error, setError] = useState<string | null>(readRedirectError);
  const [busy, setBusy] = useState<'google' | 'password' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleGoogle() {
    setError(null);
    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Google sign-in.');
      setBusy(null);
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy('password');
    try {
      await signInWithPassword(email, password);
      // On success the auth listener swaps this page for the app.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in didn’t work.');
      setBusy(null);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-8">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="brut-control glow mb-6 flex size-16 items-center justify-center rounded-md bg-neon text-on-neon">
            <IndianRupee className="size-8" aria-hidden strokeWidth={2.5} />
          </div>
          <h1 className="text-6xl leading-[0.9] font-semibold tracking-tight">
            <span className="block">Finance</span> <span className="block">Tracker</span>
          </h1>
          <p className="mt-3 text-sm text-slate-600">Every rupee in, every rupee out.</p>
        </div>

        <div className="brut space-y-4 rounded-md bg-white p-6">
          {error && <ErrorNotice title="Sign-in didn't work">{error}</ErrorNotice>}

          {methods.email && (
            <form onSubmit={handlePassword} className="space-y-4" noValidate>
              <Field label="Email">
                {(id) => (
                  <TextInput id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                )}
              </Field>
              <Field label="Password">
                {(id) => (
                  <TextInput
                    id={id}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>
              <Button type="submit" className="w-full" disabled={busy !== null}>
                {busy === 'password' ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}

          {methods.google && (
            <>
              {methods.email && (
                <div className="flex items-center gap-3 text-xs text-slate-500" aria-hidden>
                  <span className="h-0.5 flex-1 bg-slate-200" /> or <span className="h-0.5 flex-1 bg-slate-200" />
                </div>
              )}
              <Button variant={methods.email ? 'secondary' : 'primary'} className="w-full" onClick={handleGoogle} disabled={busy !== null}>
                <GoogleMark />
                {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
              </Button>
            </>
          )}
          <p className="text-center text-xs text-slate-500">Private app — only the owner's account can sign in.</p>
        </div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 rounded-full bg-white p-0.5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}
