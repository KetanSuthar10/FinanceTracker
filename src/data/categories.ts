import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, CategoryKind } from '../domain/types';
import { getSupabase } from '../lib/supabase';
import { fetchAllPages, unwrap } from './db';
import { keys } from './keys';

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: async () => {
      const rows = await fetchAllPages((from, to) =>
        getSupabase().from('categories').select('id, name, kind, archived').order('name').order('id').range(from, to),
      );
      return rows as Category[];
    },
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, kind }: { id?: string; name: string; kind: CategoryKind }) => {
      const clean = name.replace(/\s+/g, ' ').trim();
      if (!clean) throw new Error('Enter a name.');
      if (clean.length > 40) throw new Error('Keep the name under 40 characters.');
      const table = getSupabase().from('categories');
      unwrap(id ? await table.update({ name: clean }).eq('id', id).select().single() : await table.insert({ name: clean, kind }).select().single());
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.categories }),
  });
}

export function useSetCategoryArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      unwrap(await getSupabase().from('categories').update({ archived }).eq('id', id).select().single());
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.categories }),
  });
}
