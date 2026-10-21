import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Budget } from '../domain/types';
import { getSupabase } from '../lib/supabase';
import { paise, unwrap } from './db';
import { keys } from './keys';

export function useBudgets() {
  return useQuery({
    queryKey: keys.budgets,
    queryFn: async () => {
      const rows = unwrap(await getSupabase().from('budgets').select('id, category_id, monthly_limit_paise'));
      return (rows as Record<string, unknown>[]).map(
        (r): Budget => ({ id: String(r.id), category_id: String(r.category_id), monthly_limit_paise: paise(r.monthly_limit_paise) }),
      );
    },
  });
}

/** Sets a category's monthly limit, or removes it when limitPaise is null. */
export function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, limitPaise }: { categoryId: string; limitPaise: number | null }) => {
      const table = getSupabase().from('budgets');
      if (limitPaise === null) {
        unwrap(await table.delete().eq('category_id', categoryId).select('id'));
      } else {
        unwrap(
          await table
            .upsert({ category_id: categoryId, monthly_limit_paise: limitPaise }, { onConflict: 'user_id,category_id' })
            .select('id')
            .single(),
        );
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.budgets }),
  });
}
