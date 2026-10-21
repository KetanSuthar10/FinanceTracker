import clsx from 'clsx';
import type { TransactionType } from '../domain/types';
import { formatINR } from '../lib/money';

/** Signed amount for a transaction. Sign and colour both carry meaning (not colour alone). */
export function TransactionAmount({ type, amountPaise, className }: { type: TransactionType; amountPaise: number; className?: string }) {
  const text =
    type === 'expense' ? `−${formatINR(amountPaise)}` : type === 'transfer' ? formatINR(amountPaise) : `+${formatINR(amountPaise)}`;
  return (
    <span
      className={clsx(
        'font-semibold tabular-nums whitespace-nowrap',
        type === 'income' || type === 'refund' ? 'text-emerald-700' : type === 'transfer' ? 'text-slate-500' : 'text-slate-900',
        className,
      )}
    >
      {text}
    </span>
  );
}

export function Money({ paise, className }: { paise: number; className?: string }) {
  return <span className={clsx('tabular-nums whitespace-nowrap', className)}>{formatINR(paise)}</span>;
}
