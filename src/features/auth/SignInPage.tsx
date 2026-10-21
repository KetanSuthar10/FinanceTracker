import { useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { Button } from '../../components/Button';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useAuth } from './authContext';

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

export function SignInPage() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(readRedirectError);
  const [isStarting, setIsStarting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setIsStarting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Google sign-in.');
      setIsStarting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-teal-700 text-white">
            <IndianRupee className="size-7" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold">Finance Tracker</h1>
          <p className="mt-1 text-sm text-slate-600">Your money, simply tracked.</p>
        </div>

        <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {error && <ErrorNotice title="Sign-in didn't work">{error}</ErrorNotice>}
          <Button className="w-full" onClick={handleSignIn} disabled={isStarting}>
            <GoogleMark />
            {isStarting ? 'Opening Google…' : 'Continue with Google'}
          </Button>
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
