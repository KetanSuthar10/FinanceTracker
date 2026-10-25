import { ChevronRight, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { ErrorNotice } from '../../components/ErrorNotice';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useAuth } from '../auth/authContext';
import { MORE_LINKS } from './links';



export function MorePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="More" action={<ThemeToggle />} />
      <Card>
        <ul className="-mx-2">
          {MORE_LINKS.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="flex items-center gap-3 rounded-md px-2 py-3 hover:bg-slate-50">
                <l.icon className="size-5 text-teal-700" aria-hidden />
                <span className="flex-1">
                  <span className="block font-medium">{l.label}</span>
                  <span className="block text-sm text-slate-500">{l.hint}</span>
                </span>
                <ChevronRight className="size-4 text-slate-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <SignOutCard />
      <p className="text-center text-xs text-slate-400">Version {__APP_VERSION__}</p>
    </div>
  );
}

export function SignOutCard() {
  const { session, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setError(null);
    setBusy(true);
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-out failed.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="text-sm text-slate-500">Signed in as</p>
      <p className="mt-1 font-semibold break-all">{session?.user.email ?? 'Unknown account'}</p>
      {error && (
        <div className="mt-3">
          <ErrorNotice title="Couldn't sign out">{error}</ErrorNotice>
        </div>
      )}
      <Button variant="danger" className="mt-4" onClick={handleSignOut} disabled={busy}>
        <LogOut className="size-4" aria-hidden />
        {busy ? 'Signing out…' : 'Sign out'}
      </Button>
    </Card>
  );
}

/** Compact sign-in details for the computer sidebar. */
export function SidebarAccount() {
  const { session, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-md border-2 border-slate-200 p-3">
      <p className="truncate text-sm font-medium" title={session?.user.email ?? undefined}>
        {session?.user.email ?? 'Signed in'}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs whitespace-nowrap text-slate-400">v{__APP_VERSION__}</span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await signOut();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Sign-out failed.');
              setBusy(false);
            }
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold whitespace-nowrap text-red-700 hover:bg-red-50"
        >
          <LogOut className="size-4" aria-hidden />
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
