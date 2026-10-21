import { FullPageSpinner } from '../components/Spinner';
import { SignInPage } from '../features/auth/SignInPage';
import { useAuth } from '../features/auth/authContext';
import { AppShell } from './AppShell';

/** Signed out → sign-in screen. Signed in → the app. Nothing financial renders before a session exists. */
export function AuthGate() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner label="Checking sign-in…" />;
  if (!session) return <SignInPage />;
  return <AppShell />;
}
