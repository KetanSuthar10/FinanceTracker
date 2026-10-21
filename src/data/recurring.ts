import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ValidRecurring } from '../domain/recurringForm';
import type { RecurringItem } from '../domain/types';
import { getSupabase } from '../lib/supabase';
import { paise, unwrap } from './db';
import { keys } from './keys';

const COLUMNS = 'id, name, type, amount_paise, account_id, to_account_id, category_id, day_of_month, next_due_date, instalments_left, active';

function toItem(row: Record<string, unknown>): RecurringItem {
  return { ...(row as unknown as RecurringItem), amount_paise: paise(row.amount_paise) };
}

export function useRecurringItems() {
  return useQuery({
    queryKey: keys.recurring,
    queryFn: async () => {
      const rows = unwrap(await getSupabase().from('recurring_items').select(COLUMNS).order('next_due_date').order('name'));
      return (rows as Record<string, unknown>[]).map(toItem);
    },
  });
}

export function useSaveRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id?: string; value: ValidRecurring }) => {
      const table = getSupabase().from('recurring_items');
      unwrap(id ? await table.update(value).eq('id', id).select('id').single() : await table.insert(value).select('id').single());
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.recurring }),
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await getSupabase().from('recurring_items').delete().eq('id', id).select('id'));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.recurring }),
  });
}

export function useSkipRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, expectedDue }: { id: string; expectedDue: string }) => {
      const { error } = await getSupabase().rpc('skip_recurring', { p_item_id: id, p_expected_due: expectedDue });
      if (error) throw new Error(error.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.recurring }),
  });
}
