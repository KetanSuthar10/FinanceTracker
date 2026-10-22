import { Wallet } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { TransactionFormValues } from '../../domain/transactionForm';
import { parseRupeesToPaise } from '../../lib/money';
import { EmptyState } from '../../components/EmptyState';
import { Card, PageHeader } from '../../components/Card';
import { QueryState } from '../../components/LoadingBlock';
import { useTransaction, useTransactionsBetween } from '../../data/transactions';
import { useLookups } from '../../hooks/useLookups';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { monthRange, todayIST } from '../../lib/dates';
import { TransactionEditor } from './TransactionEditor';
import { TransactionRow } from './TransactionRow';

/** Reads optional pre-fill values from the URL, e.g. /add?type=transfer&to=<card>&amount=420 (from "Pay card bill"). */
function usePrefill(): Partial<TransactionFormValues> {
  const [params] = useSearchParams();
  const prefill: Partial<TransactionFormValues> = {};
  const type = params.get('type');
  if (type === 'expense' || type === 'income' || type === 'transfer' || type === 'refund') prefill.type = type;
  const amount = params.get('amount');
  if (amount && parseRupeesToPaise(amount) !== null) prefill.amountText = amount;
  const account = params.get('account');
  if (account) prefill.accountId = account;
  const to = params.get('to');
  if (to) prefill.toAccountId = to;
  const note = params.get('note');
  if (note) prefill.note = note.slice(0, 200);
  return prefill;
}

export function AddTransactionPage() {
  const lookups = useLookups();
  const isDesktop = useIsDesktop();
  const prefill = usePrefill();
  const ready = !lookups.isLoading && !lookups.error;
  const hasAccounts = lookups.accounts.some((a) => !a.archived);

  return (
    <div className="mx-auto max-w-2xl space-y-6 lg:max-w-6xl">
      <PageHeader title="Add transaction" />
      <QueryState isLoading={lookups.isLoading} error={lookups.error} retry={lookups.refetch} />
      {ready && !hasAccounts && (
        <EmptyState icon={<Wallet className="size-6" aria-hidden />} title="Add an account first">
          Transactions belong to an account (bank, cash or card).{' '}
          <Link to="/accounts/new" className="font-semibold text-teal-700 underline">
            Add your first account
          </Link>
        </EmptyState>
      )}
      {ready && hasAccounts && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <TransactionEditor
            accounts={lookups.accounts}
            categories={lookups.categories}
            recipients={lookups.recipients}
            defaultAccountId={lookups.defaultAccountId}
            initial={prefill}
          />
          {isDesktop && <RecentEntries lookups={lookups} />}
        </div>
      )}
    </div>
  );
}

/** Computer only: the latest entries next to the form, so batch entry shows what's been saved. */
function RecentEntries({ lookups }: { lookups: ReturnType<typeof useLookups> }) {
  const { from, through } = monthRange(todayIST());
  const transactions = useTransactionsBetween(from, through);
  const latest = [...(transactions.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  return (
    <Card title="Latest entries" action={<Link to="/transactions" className="text-sm font-semibold text-teal-700">All</Link>}>
      {latest.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing added this month yet.</p>
      ) : (
        <ul className="-mx-2">
          {latest.map((t) => (
            <li key={t.id}>
              <TransactionRow t={t} lookups={lookups} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        Tip: press <kbd className="rounded bg-slate-100 px-1">N</kbd> anywhere to add, <kbd className="rounded bg-slate-100 px-1">Enter</kbd> in quick add to fill the form.
      </p>
    </Card>
  );
}

export function EditTransactionPage() {
  const { id } = useParams();
  const lookups = useLookups();
  const transaction = useTransaction(id);
  const isLoading = lookups.isLoading || transaction.isLoading;
  const error = lookups.error ?? transaction.error;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Edit transaction" />
      <QueryState isLoading={isLoading} error={error} retry={() => { lookups.refetch(); void transaction.refetch(); }} />
      {!isLoading && !error && !transaction.data && (
        <EmptyState icon={<Wallet className="size-6" aria-hidden />} title="Transaction not found">
          It may have been deleted.{' '}
          <Link to="/transactions" className="font-semibold text-teal-700 underline">
            Back to transactions
          </Link>
        </EmptyState>
      )}
      {!isLoading && !error && transaction.data && (
        <TransactionEditor
          key={transaction.data.id}
          existing={transaction.data}
          accounts={lookups.accounts}
          categories={lookups.categories}
          recipients={lookups.recipients}
          defaultAccountId={lookups.defaultAccountId}
        />
      )}
    </div>
  );
}
