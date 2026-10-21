import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ValidTransaction } from '../domain/transactionForm';
import type { Recipient, Transaction } from '../domain/types';
import { getSupabase } from '../lib/supabase';
import { fetchAllPages, friendlyError, paise, unwrap } from './db';
import { keys } from './keys';
import { rememberRecipient } from './recipients';

const COLUMNS =
  'id, date, type, amount_paise, account_id, to_account_id, category_id, recipient_id, note, source, import_batch_id, recurring_item_id, created_at';

function toTransaction(row: Record<string, unknown>): Transaction {
  return { ...(row as unknown as Transaction), amount_paise: paise(row.amount_paise) };
}

/** Every transaction dated within [from, through], newest first (all pages). */
export function useTransactionsBetween(from: string, through: string) {
  return useQuery({
    queryKey: keys.transactionsBetween(from, through),
    queryFn: async () => {
      const rows = await fetchAllPages((start, end) =>
        getSupabase()
          .from('transactions')
          .select(COLUMNS)
          .gte('date', from)
          .lte('date', through)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id')
          .range(start, end),
      );
      return (rows as Record<string, unknown>[]).map(toTransaction);
    },
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: keys.transaction(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await getSupabase().from('transactions').select(COLUMNS).eq('id', id!).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toTransaction(data as Record<string, unknown>) : null;
    },
  });
}

function invalidateMoney(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: keys.transactions });
  void qc.invalidateQueries({ queryKey: keys.accountTotals });
  void qc.invalidateQueries({ queryKey: keys.recipients });
  void qc.invalidateQueries({ queryKey: keys.recurring });
}

export interface RecurringPayment {
  itemId: string;
  /** The occurrence being paid; the database refuses if it was already recorded. */
  expectedDue: string;
}

export function useSaveTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      value,
      recipients,
      recurring,
    }: {
      id?: string;
      value: ValidTransaction;
      recipients: Recipient[];
      recurring?: RecurringPayment;
    }) => {
      const recipientId = await rememberRecipient(value.recipientName, value.category_id, recipients);
      const { recipientName: _ignored, ...row } = value;
      const payload = { ...row, recipient_id: recipientId };
      const table = getSupabase().from('transactions');
      if (recurring) {
        // Saves the payment and moves the reminder on in one database transaction.
        const { data, error } = await getSupabase().rpc('pay_recurring', {
          p_item_id: recurring.itemId,
          p_expected_due: recurring.expectedDue,
          p_tx: payload,
        });
        if (error) throw friendlyError(error);
        return toTransaction(unwrap(await table.select(COLUMNS).eq('id', String(data)).single()) as Record<string, unknown>);
      }
      if (id) {
        // Keep the original source (manual/voice/import) when editing.
        const { source: _source, ...edit } = payload;
        return toTransaction(unwrap(await table.update(edit).eq('id', id).select(COLUMNS).single()) as Record<string, unknown>);
      }
      return toTransaction(unwrap(await table.insert(payload).select(COLUMNS).single()) as Record<string, unknown>);
    },
    // Refresh even after a failure: e.g. "already recorded" means another device moved the reminder on.
    onSettled: () => invalidateMoney(qc),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await getSupabase().from('transactions').delete().eq('id', id).select('id'));
    },
    onSuccess: () => invalidateMoney(qc),
  });
}
