import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BackupData } from '../domain/backup';
import { getSupabase } from '../lib/supabase';
import { fetchAllPages, friendlyError, paise } from './db';

/** Same columns as the restore function reads (supabase/migrations/…_restore_backup.sql). */
const COLUMNS = {
  accounts: 'id, name, type, opening_balance_paise, opening_date, nickname, card_due_day, archived',
  categories: 'id, name, kind, archived',
  recipients: 'id, name, aliases, default_category_id',
  import_batches: 'id, account_id, file_name, row_count, added_count, skipped_count, created_at',
  recurring_items: 'id, name, type, amount_paise, account_id, to_account_id, category_id, day_of_month, next_due_date, instalments_left, active',
  transactions:
    'id, date, type, amount_paise, account_id, to_account_id, category_id, recipient_id, note, source, import_batch_id, import_hash, recurring_item_id, created_at',
  budgets: 'id, category_id, monthly_limit_paise',
  import_mappings: 'id, account_id, mapping',
} as const;

const MONEY_FIELDS = new Set(['opening_balance_paise', 'amount_paise', 'monthly_limit_paise']);

/** Reads every row the user owns (all pages), ready for buildBackup(). */
export async function fetchBackupData(): Promise<BackupData> {
  const supabase = getSupabase();
  const out: Record<string, unknown[]> = {};
  for (const [table, columns] of Object.entries(COLUMNS)) {
    const rows = await fetchAllPages((from, to) => supabase.from(table).select(columns).order('id').range(from, to));
    out[table] = (rows as unknown as Record<string, unknown>[]).map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, MONEY_FIELDS.has(k) ? paise(v) : v])),
    );
  }
  const { data, error } = await supabase.from('settings').select('default_account_id').maybeSingle();
  if (error) throw friendlyError(error);
  return { ...(out as unknown as Omit<BackupData, 'settings'>), settings: data ?? null };
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: BackupData) => {
      const { error } = await getSupabase().rpc('restore_backup', { p_data: data });
      if (error) throw friendlyError(error);
    },
    onSettled: () => void qc.invalidateQueries(),
  });
}

/** Saves text as a file on the device (download on laptop, share/save sheet on phones). */
export function downloadFile(fileName: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
