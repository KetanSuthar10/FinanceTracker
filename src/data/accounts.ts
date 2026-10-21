import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { computePositions, type AccountTotals } from '../domain/balances';
import type { ValidAccount } from '../domain/accountForm';
import type { Account } from '../domain/types';
import { getSupabase } from '../lib/supabase';
import { paise, unwrap } from './db';
import { keys } from './keys';

function toAccount(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as Account['type'],
    opening_balance_paise: paise(row.opening_balance_paise),
    opening_date: String(row.opening_date),
    nickname: (row.nickname as string | null) ?? null,
    card_due_day: (row.card_due_day as number | null) ?? null,
    archived: Boolean(row.archived),
  };
}

export function useAccounts() {
  return useQuery({
    queryKey: keys.accounts,
    queryFn: async () => {
      const rows = unwrap(await getSupabase().from('accounts').select('*').order('created_at'));
      return rows.map(toAccount);
    },
  });
}

/** Summed effects per account, all time (current balances). */
export function useAccountTotals() {
  return useQuery({
    queryKey: keys.accountTotals,
    queryFn: async (): Promise<AccountTotals[]> => {
      const rows = unwrap(await getSupabase().rpc('account_totals'));
      return (rows as Record<string, unknown>[]).map((r) => ({
        account_id: String(r.account_id),
        income_in_paise: paise(r.income_in_paise),
        refund_in_paise: paise(r.refund_in_paise),
        expense_out_paise: paise(r.expense_out_paise),
        transfer_in_paise: paise(r.transfer_in_paise),
        transfer_out_paise: paise(r.transfer_out_paise),
      }));
    },
  });
}

/** Accounts plus their current balances and the headline positions. */
export function usePositions() {
  const accounts = useAccounts();
  const totals = useAccountTotals();
  const positions = useMemo(
    () => (accounts.data && totals.data ? computePositions(accounts.data, totals.data) : null),
    [accounts.data, totals.data],
  );
  return {
    accounts: accounts.data,
    positions,
    isLoading: accounts.isLoading || totals.isLoading,
    error: accounts.error ?? totals.error,
    refetch: () => Promise.all([accounts.refetch(), totals.refetch()]),
  };
}

export function useSaveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id?: string; value: ValidAccount }) => {
      const table = getSupabase().from('accounts');
      const result = id
        ? await table.update(value).eq('id', id).select().single()
        : await table.insert(value).select().single();
      return toAccount(unwrap(result) as Record<string, unknown>);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.accounts });
      void qc.invalidateQueries({ queryKey: keys.accountTotals });
    },
  });
}

export function useSetAccountArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      unwrap(await getSupabase().from('accounts').update({ archived }).eq('id', id).select().single());
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.accounts }),
  });
}
