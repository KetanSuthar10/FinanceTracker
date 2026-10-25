import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '../../lib/supabase';
import { queryClient } from '../../lib/queryClient';
import { AuthContext, type AuthState } from './authContext';
import { passwordSignInMessage } from './messages';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
      if (event === 'SIGNED_OUT') queryClient.clear();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      isLoading,
      async signInWithGoogle() {
        const { error } = await getSupabase().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
      },
      async signInWithPassword(email, password) {
        const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(passwordSignInMessage(error.message));
      },
      async signOut() {
        // Clear cached financial data first so nothing lingers if sign-out is slow or fails.
        queryClient.clear();
        const { error } = await getSupabase().auth.signOut();
        if (error) throw error;
      },
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
