import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '../../components/Button';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useAuth } from '../auth/authContext';

export function MorePage() {
  const { session, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setError(null);
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-out failed.');
      setIsSigningOut(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">More</h1>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-sm font-medium text-slate-500">Signed in as</h2>
        <p className="mt-1 font-semibold break-all">{session?.user.email ?? 'Unknown account'}</p>
        {error && (
          <div className="mt-4">
            <ErrorNotice title="Couldn't sign out">{error}</ErrorNotice>
          </div>
        )}
        <Button variant="danger" className="mt-4" onClick={handleSignOut} disabled={isSigningOut}>
          <LogOut className="size-4" aria-hidden />
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </section>

      <p className="text-center text-xs text-slate-400">Version {__APP_VERSION__}</p>
    </div>
  );
}
