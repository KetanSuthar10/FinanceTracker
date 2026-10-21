import { useMemo } from 'react';
import { usePositions } from '../../data/accounts';
import { useRecurringItems } from '../../data/recurring';
import { upcoming } from '../../domain/recurring';
import type { RecurringItem } from '../../domain/types';
import { addDays, formatDayLabel, todayIST } from '../../lib/dates';

/** Upcoming bills/EMIs and card due dates for the next `days` days (plus anything overdue). */
export function useUpcoming(days: number) {
  const items = useRecurringItems();
  const positions = usePositions();
  const today = todayIST();
  const entries = useMemo(() => {
    if (!items.data || !positions.accounts || !positions.positions) return [];
    const balances = positions.positions.balances;
    const cards = positions.accounts
      .filter((a) => a.type === 'card')
      .map((account) => ({ account, outstandingPaise: Math.max(0, -(balances.get(account.id) ?? 0)) }));
    return upcoming(items.data, cards, today, addDays(today, days));
  }, [items.data, positions.accounts, positions.positions, today, days]);

  return {
    entries,
    items: items.data ?? [],
    today,
    isLoading: items.isLoading || positions.isLoading,
    error: items.error ?? positions.error,
    refetch: () => {
      void items.refetch();
      void positions.refetch();
    },
  };
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' }) as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export function reminderSummary(item: RecurringItem): string {
  if (!item.active) return item.instalments_left === 0 ? 'Finished' : 'Paused';
  const parts = [`Every month on the ${ordinal(item.day_of_month)}`, `next ${formatDayLabel(item.next_due_date)}`];
  if (item.instalments_left !== null) parts.push(`${item.instalments_left} left`);
  return parts.join(' · ');
}
