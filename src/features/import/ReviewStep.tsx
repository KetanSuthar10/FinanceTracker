import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ErrorNotice } from '../../components/ErrorNotice';
import { SelectInput, TextInput } from '../../components/form';
import type { RowError } from '../../domain/importer';
import type { ExistingTransaction, ReviewRow } from '../../domain/importReview';
import { categoryKindFor, type Account, type Category, type Recipient, type TransactionType } from '../../domain/types';
import { formatShortDate } from '../../lib/dates';
import { formatINR } from '../../lib/money';

type Filter = 'all' | 'include' | 'possible' | 'imported' | 'uncategorised';

interface Props {
  account: Account;
  rows: ReviewRow[];
  errors: RowError[];
  ignoredLines: number;
  existing: ExistingTransaction[];
  accounts: Account[];
  categories: Category[];
  recipientById: Map<string, Recipient>;
  problems: { line: number; reason: string }[];
  busy: boolean;
  failure: string | null;
  onChange: (index: number, patch: Partial<ReviewRow>) => void;
  onSetAll: (include: boolean) => void;
  onBack: () => void;
  onImport: () => void;
}

const PAGE = 50;

export function ReviewStep(props: Props) {
  const { account, rows, errors, ignoredLines, problems } = props;
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const problemLines = new Map(problems.map((p) => [p.line, p.reason]));

  const counts = useMemo(
    () => ({
      all: rows.length,
      include: rows.filter((r) => r.include).length,
      possible: rows.filter((r) => r.status === 'possible').length,
      imported: rows.filter((r) => r.status === 'imported').length,
      uncategorised: rows.filter((r) => r.include && r.type !== 'transfer' && !r.categoryId).length,
    }),
    [rows],
  );
  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      filter === 'all'
        ? true
        : filter === 'include'
          ? row.include
          : filter === 'uncategorised'
            ? row.include && row.type !== 'transfer' && !row.categoryId
            : row.status === filter,
    );

  const dates = rows.map((r) => r.date).sort();
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: `All ${counts.all}` },
    { key: 'include', label: `To import ${counts.include}` },
    { key: 'possible', label: `Maybe entered already ${counts.possible}` },
    { key: 'imported', label: `Already imported ${counts.imported}` },
    { key: 'uncategorised', label: `No category ${counts.uncategorised}` },
  ];

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <Card>
        <p className="text-sm text-slate-700">
          <span className="font-semibold">{rows.length} transactions</span> in this file for <span className="font-semibold">{account.name}</span>
          {dates.length > 0 && (
            <>
              , {formatShortDate(dates[0]!)} – {formatShortDate(dates[dates.length - 1]!)}
            </>
          )}
          . Check each row, then import. Nothing is saved until you press Import.
        </p>
        {(errors.length > 0 || ignoredLines > 0) && (
          <details className="mt-3 text-sm" open={errors.length > 0 && errors.length <= 5}>
            <summary className="cursor-pointer font-medium text-amber-800">
              {errors.length} line{errors.length === 1 ? '' : 's'} couldn’t be read
              {ignoredLines > 0 && ` · ${ignoredLines} blank or summary line${ignoredLines === 1 ? '' : 's'} skipped`}
            </summary>
            <ul className="mt-2 space-y-1 text-slate-700">
              {errors.map((e) => (
                <li key={e.line}>
                  <span className="font-medium">Line {e.line}:</span> {e.reason}
                  <span className="block truncate text-xs text-slate-500">{e.text}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => {
              setFilter(f.key);
              setShown(PAGE);
            }}
            className={clsx(
              'rounded-full px-3 py-1.5 text-sm font-medium ring-1',
              filter === f.key ? 'bg-teal-700 text-white ring-teal-700' : 'bg-white text-slate-700 ring-slate-300',
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" className="min-h-9 px-2" onClick={() => props.onSetAll(true)}>
            Select all
          </Button>
          <Button variant="ghost" className="min-h-9 px-2" onClick={() => props.onSetAll(false)}>
            None
          </Button>
        </span>
      </div>

      <ul className="space-y-2">
        {visible.slice(0, shown).map(({ row, index }) => (
          <ReviewRowCard key={row.hash + index} row={row} index={index} problem={problemLines.get(row.line)} {...props} />
        ))}
        {visible.length === 0 && <li className="rounded-xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-200">Nothing here.</li>}
      </ul>
      {visible.length > shown && (
        <Button variant="secondary" className="w-full" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, visible.length - shown)} more
        </Button>
      )}

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:static lg:rounded-2xl lg:border lg:p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {problems.length > 0 && (
            <p className="text-sm text-red-700">
              {problems.length} row{problems.length === 1 ? ' needs' : 's need'} attention: {problems[0]!.reason.toLowerCase()} (line {problems[0]!.line}).
            </p>
          )}
          {props.failure && <ErrorNotice title="Not imported">{props.failure}</ErrorNotice>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={props.onBack}>
              Back
            </Button>
            <Button className="flex-1" disabled={counts.include === 0 || props.busy} onClick={props.onImport}>
              {props.busy ? 'Importing…' : `Import ${counts.include} transaction${counts.include === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewRowCard({
  row,
  index,
  problem,
  existing,
  accounts,
  categories,
  recipientById,
  account,
  onChange,
}: Props & { row: ReviewRow; index: number; problem?: string }) {
  const isIn = row.direction === 'in';
  const typeOptions: { value: TransactionType; label: string }[] = isIn
    ? [
        { value: 'income', label: 'Income' },
        { value: 'refund', label: 'Refund' },
        { value: 'transfer', label: 'Transfer in' },
      ]
    : [
        { value: 'expense', label: 'Expense' },
        { value: 'transfer', label: 'Transfer out' },
      ];
  const kind = categoryKindFor(row.type);
  const match = row.matchId ? existing.find((t) => t.id === row.matchId) : undefined;
  const matchName = match?.recipient_id ? recipientById.get(match.recipient_id)?.name : match?.note;
  const locked = row.status === 'imported';

  return (
    <li
      className={clsx(
        'rounded-xl bg-white p-3 ring-1',
        problem ? 'ring-red-300' : row.include ? 'ring-slate-200' : 'ring-slate-200 opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0 accent-teal-700"
          checked={row.include}
          disabled={locked}
          onChange={(e) => onChange(index, { include: e.target.checked })}
          aria-label={`Import line ${row.line}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-slate-500">{formatShortDate(row.date)}</span>
            <span className={clsx('font-semibold tabular-nums', isIn && 'text-emerald-700')}>
              {isIn ? '+' : '−'}
              {formatINR(row.amountPaise)}
            </span>
          </div>
          <p className="text-sm break-words text-slate-700">{row.description || '(no description)'}</p>
          {row.status === 'imported' && <p className="mt-1 text-sm font-medium text-slate-500">Already imported — skipped</p>}
          {row.status === 'possible' && (
            <p className="mt-1 text-sm text-amber-800">
              Possibly already entered: {formatINR(match?.amount_paise ?? row.amountPaise)} on {match ? formatShortDate(match.date) : '?'}
              {matchName ? ` (${matchName})` : ''}. Tick to import it anyway.
            </p>
          )}
          {problem && <p className="mt-1 text-sm font-medium text-red-700">{problem}</p>}
        </div>
      </div>

      {row.include && !locked && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <SelectInput
            aria-label="Type"
            value={row.type}
            onChange={(e) => {
              const type = e.target.value as TransactionType;
              const keep = categories.find((c) => c.id === row.categoryId)?.kind === categoryKindFor(type);
              onChange(index, { type, categoryId: keep ? row.categoryId : null });
            }}
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
          {row.type === 'transfer' ? (
            <SelectInput
              aria-label={isIn ? 'Came from' : 'Went to'}
              className="sm:col-span-2"
              value={row.counterAccountId ?? ''}
              onChange={(e) => onChange(index, { counterAccountId: e.target.value || null })}
            >
              <option value="">{isIn ? 'Came from which account?' : 'Went to which account?'}</option>
              {accounts
                .filter((a) => a.id !== account.id && !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {isIn ? 'From ' : 'To '}
                    {a.name}
                  </option>
                ))}
            </SelectInput>
          ) : (
            <>
              <TextInput
                aria-label="Name"
                placeholder="Name"
                value={row.recipientName}
                onChange={(e) => onChange(index, { recipientName: e.target.value })}
              />
              <SelectInput aria-label="Category" value={row.categoryId ?? ''} onChange={(e) => onChange(index, { categoryId: e.target.value || null })}>
                <option value="">Uncategorised</option>
                {categories
                  .filter((c) => c.kind === kind && !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </SelectInput>
            </>
          )}
        </div>
      )}
    </li>
  );
}
