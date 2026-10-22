import { Landmark, Plus, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Money } from '../../components/Amount';
import { ButtonLink } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/LoadingBlock';
import { MonthPicker } from '../../components/MonthPicker';
import { usePositions } from '../../data/accounts';
import { useTransactionsBetween } from '../../data/transactions';
import { summarizePeriod, type Breakdown } from '../../domain/summary';
import { useLookups } from '../../hooks/useLookups';
import { useMonthParam } from '../../hooks/useMonthParam';
import { formatINR } from '../../lib/money';
import { BalanceText } from '../accounts/BalanceText';
import { TransactionRow } from '../transactions/TransactionRow';
import { BudgetsCard, DueSoonCard, TrendCard } from './HomeExtras';

export function HomePage() {
  const month = useMonthParam();
  const lookups = useLookups();
  const positions = usePositions();
  const transactions = useTransactionsBetween(month.from, month.through);

  const summary = useMemo(
    () => summarizePeriod(transactions.data ?? [], month.from, month.through),
    [transactions.data, month.from, month.through],
  );

  const isLoading = lookups.isLoading || positions.isLoading || transactions.isLoading;
  const error = lookups.error ?? positions.error ?? transactions.error;
  const activeAccounts = lookups.accounts.filter((a) => !a.archived);
  const monthQuery = month.isCurrent ? '' : `month=${month.month}`;
  const linkTo = (extra: string) => `/transactions?${[monthQuery, extra].filter(Boolean).join('&')}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Home"
        action={<MonthPicker label={month.label} onPrevious={month.previous} onNext={month.next} canGoNext={!month.isCurrent} />}
      />

      <QueryState
        isLoading={isLoading}
        error={error}
        retry={() => {
          lookups.refetch();
          void positions.refetch();
          void transactions.refetch();
        }}
      />

      {!isLoading && !error && activeAccounts.length === 0 && (
        <EmptyState icon={<Wallet className="size-6" aria-hidden />} title="Welcome! Start with your accounts">
          <p>Add each bank account, your cash and any credit cards, with their balance on a starting date.</p>
          <ButtonLink to="/accounts/new" className="mt-4">
            <Plus className="size-4" aria-hidden /> Add an account
          </ButtonLink>
        </EmptyState>
      )}

      {!isLoading && !error && activeAccounts.length > 0 && positions.positions && (
        <>
          <Card title={month.isCurrent ? 'This month' : month.label}>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Income" value={summary.incomePaise} tone="text-emerald-700" />
              <Stat label="Spending" value={summary.spendingPaise} />
              <Stat label="Saved" value={summary.savedPaise} tone={summary.savedPaise < 0 ? 'text-red-700' : 'text-slate-900'} />
            </dl>
          </Card>

          {/* Phone: one column. Laptop: two. Wide screens: three side by side. */}
          <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <div className="grid gap-5 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
              <DueSoonCard className="lg:only:col-span-2" />
              <BudgetsCard spendingByCategory={summary.spendingByCategory} />
            </div>
            <Card title="Balances today" action={<Link to="/accounts" className="text-sm font-semibold text-teal-700">Accounts</Link>}>
              <dl className="mb-3 grid grid-cols-2 gap-3 border-b border-slate-100 pb-3">
                <div>
                  <dt className="text-sm text-slate-500">Money in hand</dt>
                  <dd className="text-xl font-bold">
                    <Money paise={positions.positions.moneyInHandPaise} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Card outstanding</dt>
                  <dd className="text-xl font-bold">
                    <Money paise={positions.positions.cardOutstandingPaise} />
                  </dd>
                </div>
              </dl>
              <ul className="space-y-2">
                {activeAccounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Landmark className="size-4 shrink-0 text-slate-400" aria-hidden />
                      <span className="truncate">{a.name}</span>
                    </span>
                    <BalanceText type={a.type} balancePaise={positions.positions!.balances.get(a.id) ?? 0} className="font-medium" />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Net position {formatINR(positions.positions.netPositionPaise)} (everything you have minus card debt).
              </p>
            </Card>

            <Card title="Spending by category">
              <BarList
                items={summary.spendingByCategory}
                name={(id) => (id ? (lookups.categoryById.get(id)?.name ?? 'Unknown') : 'Uncategorised')}
                href={(id) => linkTo(`category=${id ?? 'none'}`)}
                empty="No spending recorded this month."
              />
            </Card>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <TrendCard endMonthFrom={month.from} className="lg:col-span-2 xl:col-span-1" />
            <Card title="Top recipients">
              <BarList
                items={summary.spendingByRecipient.slice(0, 5)}
                name={(id) => lookups.recipientById.get(id ?? '')?.name ?? 'Unknown'}
                href={(id) => linkTo(`q=${encodeURIComponent(lookups.recipientById.get(id ?? '')?.name ?? '')}`)}
                empty="Recipients you spend with will show up here."
              />
            </Card>

            <Card title="Recent" action={<Link to={linkTo('')} className="text-sm font-semibold text-teal-700">See all</Link>}>
              {(transactions.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nothing yet this month.{' '}
                  <Link to="/add" className="font-semibold text-teal-700 underline">
                    Add a transaction
                  </Link>
                </p>
              ) : (
                <ul className="-mx-2">
                  {(transactions.data ?? []).slice(0, 5).map((t) => (
                    <li key={t.id}>
                      <TransactionRow t={t} lookups={lookups} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'text-slate-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`text-2xl font-bold ${tone}`}>
        <Money paise={value} />
      </dd>
    </div>
  );
}

function BarList({
  items,
  name,
  href,
  empty,
}: {
  items: Breakdown[];
  name: (id: string | null) => string;
  href: (id: string | null) => string;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...items.map((i) => i.amountPaise), 1);
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id ?? 'none'}>
          <Link to={href(item.id)} className="block rounded-lg px-2 py-1.5 hover:bg-slate-50">
            <span className="flex items-center justify-between gap-3 text-sm">
              <span className={'truncate ' + (item.id ? '' : 'text-amber-700')}>{name(item.id)}</span>
              <Money paise={item.amountPaise} className="font-medium" />
            </span>
            <span className="mt-1 block h-1.5 rounded-full bg-slate-100" aria-hidden>
              <span
                className="block h-1.5 rounded-full bg-teal-600"
                style={{ width: `${Math.max(0, (item.amountPaise / max) * 100)}%` }}
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
