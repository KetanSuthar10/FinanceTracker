import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../lib/supabase';

/**
 * Makes sure a signed-in user has the starter categories and a settings row.
 * Safe to run on every visit; it only inserts what is missing.
 * Also serves as the first real check that the database is reachable.
 */
export function useStarterData() {
  return useQuery({
    queryKey: ['starter-data'],
    queryFn: async () => {
      const { error } = await getSupabase().rpc('ensure_starter_data');
      if (error) throw new Error(error.message);
      return true;
    },
    staleTime: Infinity,
  });
}
