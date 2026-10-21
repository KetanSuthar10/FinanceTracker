import clsx from 'clsx';
import type { AccountType } from '../../domain/types';
import { formatINR } from '../../lib/money';

/** Shows a balance the way people read it: cards as "Outstanding" / "Credit", others as money held. */
export function BalanceText({ type, balancePaise, className }: { type: AccountType; balancePaise: number; className?: string }) {
  if (type === 'card') {
    if (balancePaise < 0) return <span className={clsx('tabular-nums', className)}>Outstanding {formatINR(-balancePaise)}</span>;
    if (balancePaise > 0) return <span className={clsx('tabular-nums text-emerald-700', className)}>Credit {formatINR(balancePaise)}</span>;
    return <span className={clsx('text-slate-500', className)}>Nothing owed</span>;
  }
  return (
    <span className={clsx('tabular-nums', balancePaise < 0 && 'text-red-700', className)}>
      {balancePaise < 0 ? `Overdrawn ${formatINR(-balancePaise)}` : formatINR(balancePaise)}
    </span>
  );
}
