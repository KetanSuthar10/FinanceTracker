import { ListX, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/Card';
import { SelectInput, TextInput } from '../../components/form';
import { QueryState } from '../../components/LoadingBlock';
import { MonthPicker } from '../../components/MonthPicker';
import { ButtonLink } from '../../components/Button';
import { useTransactionsBetween } from '../../data/transactions';
import { normalizeName } from '../../domain/recipients';
import { summarizePeriod } from '../../domain/summary';
import { TRANSACTION_TYPE_LABEL, type TransactionType } from '../../domain/types';
import { useLookups } from '../../hooks/useLookups';
import { useMonthParam } from '../../hooks/useMonthParam';
import { formatDayLabel } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { TransactionRow } from './TransactionRow';
import { TransactionsTable } from './TransactionsTable';
import { transactionTitle } from './title';

export function TransactionsPage() {
  const month = useMonthParam();
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const lookups = useLookups();
  const transactions = useTransactionsBetween(month.from, month.through);

  const urlQ = params.get('q') ?? '';
  // Typed text lives here so fast typing never loses letters; the URL catches up after a pause.
  const [q, setQ] = useState(urlQ);
  const [lastUrlQ, setLastUrlQ] = useState(urlQ);
  if (urlQ !== lastUrlQ) {
    // The URL changed from outside (e.g. a link from Home): show that search.
    setLastUrlQ(urlQ);
    setQ(urlQ);
  }
  const accountFilter = params.get('account') ?? '';
  const categoryFilter = params.get('category') ?? '';
  const typeFilter = (params.get('type') ?? '') as TransactionType | '';

  function setFilter(key: string, value: string) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    if (q === urlQ) return;
    const timer = setTimeout(() => {
      setLastUrlQ(q);
      setFilter('q', q);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setFilter is stable enough; only react to typing
  }, [q, urlQ]);

  const filtered = useMemo(() => {
    const needle = normalizeName(q);
    return (transactions.data ?? []).filter((t) => {
      if (typeFilter && t.type !== typeFilter) return false;
      if (accountFilter && t.account_id !== accountFilter && t.to_account_id !== accountFilter) return false;
      if (categoryFilter === 'none' ? t.category_id !== null || t.type === 'transfer' : categoryFilter && t.category_id !== categoryFilter)
        return false;
      if (needle) {
        const haystack = normalizeName(`${transactionTitle(t, lookups)} ${t.note ?? ''}`);
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [transactions.data, q, typeFilter, accountFilter, categoryFilter, lookups]);

  const groups = useMemo(() => {
    const byDay = new Map<string, typeof filtered>();
    for (const t of filtered) {
      if (!byDay.has(t.date)) byDay.set(t.date, []);
      byDay.get(t.date)!.push(t);
    }
    return [...byDay.entries()];
  }, [filtered]);

  const totals = useMemo(() => summarizePeriod(filtered, month.from, month.through), [filtered, month.from, month.through]);
  const isFiltered = Boolean(q || accountFilter || categoryFilter || typeFilter);
  const isLoading = transactions.isLoading || lookups.isLoading;
  const error = transactions.error ?? lookups.error;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        action={
          <div className="hidden lg:block">
            <ButtonLink to="/add">
              <Plus className="size-4" aria-hidden /> Add
            </ButtonLink>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
        <MonthPicker label={month.label} onPrevious={month.previous} onNext={month.next} canGoNext={!month.isCurrent} />
        <div className="relative w-full sm:ml-auto sm:w-64 lg:ml-0 lg:w-auto lg:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <TextInput
            id="transaction-search"
            autoFocus={params.get('focus') === 'search'}
            type="search"
            aria-label="Search by name or note"
            placeholder={isDesktop ? 'Search name or note  ( / )' : 'Search name or note'}
            className="pl-9"
            compact={isDesktop}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:max-w-3xl">
        <SelectInput compact={isDesktop} aria-label="Filter by account" value={accountFilter} onChange={(e) => setFilter('account', e.target.value)}>
          <option value="">All accounts</option>
          {lookups.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput compact={isDesktop} aria-label="Filter by category" value={categoryFilter} onChange={(e) => setFilter('category', e.target.value)}>
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {lookups.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.kind === 'income' ? ' (income)' : ''}
            </option>
          ))}
        </SelectInput>
        <SelectInput compact={isDesktop} aria-label="Filter by type" value={typeFilter} onChange={(e) => setFilter('type', e.target.value)}>
          <option value="">All types</option>
          {(Object.keys(TRANSACTION_TYPE_LABEL) as TransactionType[]).map((t) => (
            <option key={t} value={t}>
              {TRANSACTION_TYPE_LABEL[t]}
            </option>
          ))}
        </SelectInput>
      </div>

      <QueryState isLoading={isLoading} error={error} retry={() => void transactions.refetch()} />

      {!isLoading && !error && (
        <>
          {filtered.length > 0 && (
            <p className="text-sm text-slate-600">
              {filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'} · In {formatINR(totals.incomePaise)} · Out{' '}
              {formatINR(totals.spendingPaise)}
            </p>
          )}
          {groups.length === 0 ? (
            <EmptyState icon={<ListX className="size-6" aria-hidden />} title={isFiltered ? 'Nothing matches' : 'No transactions this month'}>
              {isFiltered ? (
                'Try a different search or clear the filters.'
              ) : (
                <>
                  {isDesktop ? 'Press N or choose' : 'Tap'}{' '}
                  <Link to="/add" className="font-semibold text-teal-700 underline">
                    Add
                  </Link>{' '}
                  to record one.
                </>
              )}
            </EmptyState>
          ) : isDesktop ? (
            <TransactionsTable transactions={filtered} lookups={lookups} />
          ) : (
            <div className="space-y-4">
              {groups.map(([day, items]) => (
                <section key={day} className="rounded-2xl bg-white p-2 ring-1 ring-slate-200">
                  <h2 className="px-2 pt-1 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    {formatDayLabel(day)}
                  </h2>
                  <ul>
                    {items.map((t) => (
                      <li key={t.id}>
                        <TransactionRow t={t} lookups={lookups} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
