import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { findRecipient } from '../domain/recipients';
import type { Recipient } from '../domain/types';
import { getSupabase } from '../lib/supabase';
import { fetchAllPages, unwrap } from './db';
import { keys } from './keys';

export function useRecipients() {
  return useQuery({
    queryKey: keys.recipients,
    queryFn: async () => {
      // Paged: years of statement imports can create more than Supabase's 1,000-row default.
      const rows = await fetchAllPages((from, to) =>
        getSupabase().from('recipients').select('id, name, aliases, default_category_id').order('name').order('id').range(from, to),
      );
      return rows as Recipient[];
    },
  });
}

/**
 * Recipient memory: find the recipient by name/alias or create it, and remember the
 * category just used for it. Returns the recipient id (or null when no name was given).
 */
export async function rememberRecipient(
  name: string | null,
  categoryId: string | null,
  known: Recipient[],
): Promise<string | null> {
  if (!name) return null;
  const supabase = getSupabase();
  const existing = findRecipient(name, known);
  if (existing) {
    if (categoryId && existing.default_category_id !== categoryId) {
      unwrap(
        await supabase.from('recipients').update({ default_category_id: categoryId }).eq('id', existing.id).select().single(),
      );
    }
    return existing.id;
  }
  const inserted = await supabase
    .from('recipients')
    .insert({ name, default_category_id: categoryId })
    .select('id')
    .single();
  if (inserted.error?.code === '23505') {
    // Created meanwhile (e.g. on another device) — use that one.
    const again = unwrap(await supabase.from('recipients').select('id').eq('name', name).single());
    return String((again as { id: string }).id);
  }
  return String((unwrap(inserted) as { id: string }).id);
}

export function useSaveRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: Omit<Recipient, 'id'> & { id: string }) => {
      const name = values.name.replace(/\s+/g, ' ').trim();
      if (!name) throw new Error('Enter a name.');
      unwrap(
        await getSupabase()
          .from('recipients')
          .update({ name, aliases: values.aliases, default_category_id: values.default_category_id })
          .eq('id', id)
          .select()
          .single(),
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.recipients }),
  });
}

export function useDeleteRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await getSupabase().from('recipients').delete().eq('id', id).select());
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.recipients });
      void qc.invalidateQueries({ queryKey: keys.transactions });
    },
  });
}
