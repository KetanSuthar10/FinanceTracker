import clsx from 'clsx';
import { useNavigate } from 'react-router';
import { Link } from 'react-router';
import { TransactionAmount } from '../../components/Amount';
import type { Transaction } from '../../domain/types';
import { formatDayLabel } from '../../lib/dates';
import { transactionTitle, type RowLookups } from './title';

const SOURCE_LABEL: Record<Transaction['source'], string | null> = {
  manual: null,
  voice: 'Voice',
  import: 'Imported',
  recurring: 'Reminder',
};

/** Computer layout: one compact row per transaction, so a month fits on screen. */
export function TransactionsTable({ transactions, lookups }: { transactions: Transaction[]; lookups: RowLookups }) {
  const navigate = useNavigate();
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      <table className="w-full table-fixed text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
          <tr>
            <th scope="col" className="w-28 px-4 py-2.5">
              Date
            </th>
            <th scope="col" className="px-4 py-2.5">
              Name
            </th>
            <th scope="col" className="w-40 px-4 py-2.5">
              Category
            </th>
            <th scope="col" className="w-48 px-4 py-2.5 xl:w-64">
              Account
            </th>
            <th scope="col" className="w-36 px-4 py-2.5 text-right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {transactions.map((t, i) => {
            const newDay = i === 0 || transactions[i - 1]!.date !== t.date;
            const isTransfer = t.type === 'transfer';
            const category = t.category_id ? lookups.categoryById.get(t.category_id)?.name : null;
            const from = lookups.accountById.get(t.account_id)?.name ?? 'Account';
            const to = t.to_account_id ? (lookups.accountById.get(t.to_account_id)?.name ?? 'Account') : null;
            const tag = t.type === 'refund' ? 'Refund' : SOURCE_LABEL[t.source];
            const title = isTransfer ? 'Transfer' : transactionTitle(t, lookups);
            return (
              <tr
                key={t.id}
                onClick={() => navigate(`/transactions/${t.id}`)}
                className={clsx('cursor-pointer hover:bg-slate-50', newDay && i > 0 && 'border-t-2 border-t-slate-200')}
              >
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{newDay ? formatDayLabel(t.date) : ''}</td>
                <td className="truncate px-4 py-2.5">
                  <Link
                    to={`/transactions/${t.id}`}
                    className="font-medium text-slate-900 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {title}
                  </Link>
                  {tag && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tag}</span>}
                  {t.note && t.note !== title && <span className="ml-2 text-slate-500">{t.note}</span>}
                </td>
                <td className={clsx('truncate px-4 py-2.5', !category && !isTransfer ? 'text-amber-700' : 'text-slate-700')}>
                  {isTransfer ? <span className="text-slate-400">—</span> : (category ?? 'Uncategorised')}
                </td>
                <td className="truncate px-4 py-2.5 text-slate-700" title={to ? `${from} → ${to}` : from}>{to ? `${from} → ${to}` : from}</td>
                <td className="px-4 py-2.5 text-right">
                  <TransactionAmount type={t.type} amountPaise={t.amount_paise} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
