import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnMapping } from '../domain/importer';
import type { ExistingTransaction, ImportPayloadRow } from '../domain/importReview';
import { addDays } from '../lib/dates';
import { getSupabase } from '../lib/supabase';
import { fetchAllPages, friendlyError, paise, unwrap } from './db';
import { keys } from './keys';

export interface ImportBatch {
  id: string;
  account_id: string;
  file_name: string;
  row_count: number;
  added_count: number;
  skipped_count: number;
  created_at: string;
}

export function useImportBatches() {
  return useQuery({
    queryKey: keys.importBatches,
    queryFn: async () => {
      const rows = unwrap(
        await getSupabase()
          .from('import_batches')
          .select('id, account_id, file_name, row_count, added_count, skipped_count, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
      );
      return rows as ImportBatch[];
    },
  });
}

export async function loadMapping(accountId: string): Promise<ColumnMapping | null> {
  const { data, error } = await getSupabase().from('import_mappings').select('mapping').eq('account_id', accountId).maybeSingle();
  if (error) throw friendlyError(error);
  return (data?.mapping as ColumnMapping | undefined) ?? null;
}

export async function saveMapping(accountId: string, mapping: ColumnMapping): Promise<void> {
  unwrap(
    await getSupabase()
      .from('import_mappings')
      .upsert({ account_id: accountId, mapping }, { onConflict: 'user_id,account_id' })
      .select('id')
      .single(),
  );
}

/** Transactions touching the account within ±3 days of the statement, to spot duplicates. */
export async function loadExistingForImport(accountId: string, from: string, through: string): Promise<ExistingTransaction[]> {
  const rows = await fetchAllPages((start, end) =>
    getSupabase()
      .from('transactions')
      .select('id, date, type, amount_paise, account_id, to_account_id, import_hash, recipient_id, note')
      .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
      .gte('date', addDays(from, -3))
      .lte('date', addDays(through, 3))
      .order('id')
      .range(start, end),
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as ExistingTransaction),
    amount_paise: paise(r.amount_paise),
  }));
}

export function useCommitImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      batchId: string;
      accountId: string;
      fileName: string;
      rowCount: number;
      skippedCount: number;
      rows: ImportPayloadRow[];
    }) => {
      const { data, error } = await getSupabase().rpc('commit_import', {
        p_batch_id: args.batchId,
        p_account_id: args.accountId,
        p_file_name: args.fileName,
        p_row_count: args.rowCount,
        p_skipped_count: args.skippedCount,
        p_rows: args.rows,
      });
      if (error) {
        if (error.code === '23505') throw new Error('Some of these rows were imported meanwhile. Load the file again to refresh the review.');
        throw friendlyError(error);
      }
      return data as { batch_id: string; added: number; already_done: boolean };
    },
    onSettled: () => {
      for (const key of [keys.transactions, keys.accountTotals, keys.recipients, keys.importBatches]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useUndoImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) => {
      unwrap(await getSupabase().from('import_batches').delete().eq('id', batchId).select('id'));
    },
    onSettled: () => {
      for (const key of [keys.transactions, keys.accountTotals, keys.importBatches]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
