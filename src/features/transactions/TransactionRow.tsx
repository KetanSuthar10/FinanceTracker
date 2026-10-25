import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import { TransactionAmount } from '../../components/Amount';
import type { Transaction } from '../../domain/types';
import { transactionTitle, type RowLookups } from './title';

const ICON = {
  expense: ArrowUpRight,
  income: ArrowDownLeft,
  transfer: ArrowLeftRight,
  refund: RotateCcw,
};

export function TransactionRow({ t, lookups }: { t: Transaction; lookups: RowLookups }) {
  const Icon = ICON[t.type];
  const category = t.category_id ? lookups.categoryById.get(t.category_id)?.name : null;
  const account = lookups.accountById.get(t.account_id)?.name;
  const details =
    t.type === 'transfer'
      ? ['Transfer', t.note].filter(Boolean)
      : [t.type === 'refund' ? 'Refund' : null, category ?? 'Uncategorised', account].filter(Boolean);

  return (
    <Link
      to={`/transactions/${t.id}`}
      className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-slate-50 focus-visible:bg-slate-50"
    >
      <span
        className={
          'flex size-9 shrink-0 items-center justify-center rounded-md border-2 ' +
          (t.type === 'income' || t.type === 'refund'
            ? 'border-emerald-700 bg-emerald-50 text-emerald-700'
            : t.type === 'transfer'
              ? 'border-slate-300 bg-slate-100 text-slate-500'
              : 'border-slate-900 bg-white text-slate-900')
        }
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-slate-900">{transactionTitle(t, lookups)}</span>
        <span className={'block truncate text-sm ' + (category || t.type === 'transfer' ? 'text-slate-500' : 'text-amber-700')}>
          {details.join(' · ')}
        </span>
      </span>
      <TransactionAmount type={t.type} amountPaise={t.amount_paise} />
    </Link>
  );
}
