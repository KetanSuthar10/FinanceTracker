import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Settings } from '../domain/types';
import { useAuth } from '../features/auth/authContext';
import { getSupabase } from '../lib/supabase';
import { unwrap } from './db';
import { keys } from './keys';

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: async (): Promise<Settings | null> => {
      const { data, error } = await getSupabase().from('settings').select('user_id, default_account_id').maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Settings | null) ?? null;
    },
  });
}

export function useSetDefaultAccount() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (accountId: string | null) => {
      const userId = session?.user.id;
      if (!userId) throw new Error('Your session has expired. Sign in again.');
      unwrap(
        await getSupabase()
          .from('settings')
          .upsert({ user_id: userId, default_account_id: accountId }, { onConflict: 'user_id' })
          .select()
          .single(),
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.settings }),
  });
}
