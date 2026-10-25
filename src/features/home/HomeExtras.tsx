import { CalendarClock, CreditCard } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Card } from '../../components/Card';
import { useBudgets } from '../../data/budgets';
import { useTransactionsBetween } from '../../data/transactions';
import { budgetProgress } from '../../domain/budgets';
import type { Breakdown } from '../../domain/summary';
import { summarizePeriod } from '../../domain/summary';
import { useLookups } from '../../hooks/useLookups';
import { addMonths, formatDayLabel, monthRange } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { BudgetBar } from '../budgets/BudgetBar';
import { useUpcoming } from '../upcoming/useUpcoming';

export function DueSoonCard({ className }: { className?: string }) {
  const { entries, today, isLoading } = useUpcoming(7);
  if (isLoading) return null;
  return (
    <Card className={className} title="Due in the next 7 days" action={<Link to="/upcoming" className="text-sm font-semibold text-teal-700">Upcoming</Link>}>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing due this week.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => {
            const overdue = e.date < today;
            const isCard = e.kind === 'card';
            const Icon = isCard ? CreditCard : CalendarClock;
            const name = isCard ? `${e.account.name} bill` : e.item.name;
            const amount = isCard ? (e.outstandingPaise > 0 ? `Outstanding ${formatINR(e.outstandingPaise)}` : 'Nothing owed') : formatINR(e.item.amount_paise);
            return (
              <li key={`${e.kind}-${isCard ? e.account.id : e.item.id}-${e.date}`} className="flex items-center gap-3 text-sm">
                <Icon className="size-4 shrink-0 text-teal-700" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name}</span>
                  <span className={overdue ? 'font-semibold text-red-700' : 'text-slate-500'}>
                    {overdue ? 'Overdue · ' : ''}
                    {formatDayLabel(e.date, today)}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{amount}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function BudgetsCard({ spendingByCategory }: { spendingByCategory: Breakdown[] }) {
  const budgets = useBudgets();
  const lookups = useLookups();
  const progress = useMemo(() => budgetProgress(budgets.data ?? [], spendingByCategory), [budgets.data, spendingByCategory]);
  if (budgets.isLoading || progress.length === 0) return null;
  return (
    <Card title="Budgets" action={<Link to="/budgets" className="text-sm font-semibold text-teal-700">Edit</Link>}>
      <ul className="space-y-3">
        {progress.map((p) => (
          <li key={p.categoryId}>
            <p className="mb-1 text-sm font-medium">{lookups.categoryById.get(p.categoryId)?.name ?? 'Category'}</p>
            <BudgetBar progress={p} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

const monthShort = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });

/** Income vs spending for the 6 months ending with the selected one. Plain bars, with numbers in text. */
export function TrendCard({ endMonthFrom, className }: { endMonthFrom: string; className?: string }) {
  const start = addMonths(endMonthFrom, -5);
  const through = monthRange(endMonthFrom).through;
  const transactions = useTransactionsBetween(start, through);

  const months = useMemo(() => {
    const all = Array.from({ length: 6 }, (_, i) => {
      const range = monthRange(addMonths(start, i));
      const s = summarizePeriod(transactions.data ?? [], range.from, range.through);
      return { from: range.from, label: monthShort.format(new Date(`${range.from}T00:00:00Z`)), income: s.incomePaise, spending: s.spendingPaise };
    });
    // Start from the first month that has anything, but always show the selected month.
    const first = all.findIndex((m) => m.income !== 0 || m.spending !== 0);
    return all.slice(first === -1 ? all.length - 1 : first);
  }, [transactions.data, start]);

  if (transactions.isLoading || transactions.error) return null;
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.spending]));
  const pct = (v: number) => `${Math.max(0, (v / max) * 100)}%`;

  return (
    <Card className={className} title={months.length > 1 ? `Last ${months.length} months` : 'This month so far'}>
      <div className="mb-3 flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 bg-emerald-500" aria-hidden /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 bg-slate-900" aria-hidden /> Spending
        </span>
      </div>
      <ul className="space-y-2.5">
        {months.map((m) => (
          <li key={m.from} className="grid grid-cols-[2.5rem_1fr] items-center gap-2 text-sm">
            <span className="text-slate-500">{m.label}</span>
            <span className="space-y-1">
              {[
                { label: 'In', value: m.income, color: 'bg-emerald-500' },
                { label: 'Out', value: m.spending, color: 'bg-slate-900' },
              ].map((bar) => (
                <span key={bar.label} className="flex items-center gap-2">
                  <span className="h-2.5 min-w-0 flex-1" aria-hidden>
                    <span className={`block h-2.5 ${bar.color}`} style={{ width: pct(bar.value) }} />
                  </span>
                  <span className="w-28 shrink-0 text-right text-xs whitespace-nowrap text-slate-600 tabular-nums">
                    {bar.label} {formatINR(bar.value)}
                  </span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
