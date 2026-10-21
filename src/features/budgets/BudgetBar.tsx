import clsx from 'clsx';
import type { BudgetProgress } from '../../domain/budgets';
import { formatINR } from '../../lib/money';

const LABEL = { ok: 'On track', near: 'Near limit', over: 'Over' };

/** Progress bar with a text label, so status never relies on colour alone. */
export function BudgetBar({ progress }: { progress: BudgetProgress }) {
  const { status, spentPaise, limitPaise, percent } = progress;
  const text =
    status === 'over'
      ? `Over by ${formatINR(spentPaise - limitPaise)}`
      : `${formatINR(limitPaise - spentPaise)} left of ${formatINR(limitPaise)}`;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span
          className={clsx(
            'font-medium',
            status === 'over' ? 'text-red-700' : status === 'near' ? 'text-amber-700' : 'text-emerald-700',
          )}
        >
          {LABEL[status]} · {percent}%
        </span>
        <span className="text-slate-600 tabular-nums">{text}</span>
      </div>
      <div
        className="mt-1 h-2 rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
        aria-label={`${percent}% of budget used`}
      >
        <div
          className={clsx('h-2 rounded-full', status === 'over' ? 'bg-red-600' : status === 'near' ? 'bg-amber-500' : 'bg-emerald-600')}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
