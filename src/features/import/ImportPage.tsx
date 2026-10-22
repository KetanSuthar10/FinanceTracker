import { CircleCheck, FileUp, History } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { Button, ButtonLink } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Field, SelectInput } from '../../components/form';
import { QueryState } from '../../components/LoadingBlock';
import {
  loadExistingForImport,
  loadMapping,
  saveMapping,
  useCommitImport,
  useImportBatches,
  useUndoImport,
} from '../../data/imports';
import {
  findHeaderRow,
  findHeaderRowForMapping,
  normalizeRows,
  rowHashes,
  suggestMapping,
  type ColumnMapping,
  type Grid,
  type RowError,
} from '../../domain/importer';
import { buildReview, toPayload, type ExistingTransaction, type ReviewRow } from '../../domain/importReview';
import { ACCOUNT_TYPE_LABEL, type Account } from '../../domain/types';
import { useLookups } from '../../hooks/useLookups';
import { formatShortDate, monthKey, todayIST } from '../../lib/dates';
import { readStatementFile, StatementFileError } from '../../lib/readStatementFile';
import { MappingStep } from './MappingStep';
import { ReviewStep } from './ReviewStep';

type Step =
  | { kind: 'pick' }
  | { kind: 'map'; grid: Grid; headerRow: number; mapping: Partial<ColumnMapping> }
  | {
      kind: 'review';
      grid: Grid;
      headerRow: number;
      mapping: ColumnMapping;
      rows: ReviewRow[];
      errors: RowError[];
      ignoredLines: number;
      existing: ExistingTransaction[];
      batchId: string;
    }
  | { kind: 'done'; added: number; firstDate: string | null };

export function ImportPage() {
  const lookups = useLookups();
  const commit = useCommitImport();
  const [accountId, setAccountId] = useState('');
  const [fileName, setFileName] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ line: number; reason: string }[]>([]);

  const accounts = lookups.accounts.filter((a) => !a.archived);
  const account = lookups.accounts.find((a) => a.id === accountId);

  async function prepareReview(grid: Grid, headerRow: number, mapping: ColumnMapping, acc: Account) {
    const { rows, errors, ignoredLines } = normalizeRows(grid, headerRow, mapping);
    if (rows.length === 0) {
      throw new StatementFileError(
        errors.length > 0
          ? `None of the ${errors.length} lines could be read (first problem, line ${errors[0]!.line}: ${errors[0]!.reason}). Check the columns.`
          : 'No transactions found in this file.',
      );
    }
    const dates = rows.map((r) => r.date).sort();
    const [hashes, existing] = await Promise.all([
      rowHashes(acc.id, rows),
      loadExistingForImport(acc.id, dates[0]!, dates[dates.length - 1]!),
    ]);
    const review = buildReview(rows, hashes, {
      account: acc,
      accounts: lookups.accounts,
      defaultAccountId: lookups.defaultAccountId,
      recipients: lookups.recipients,
      categories: lookups.categories,
      existing,
    });
    setProblems([]);
    commit.reset();
    setStep({ kind: 'review', grid, headerRow, mapping, rows: review, errors, ignoredLines, existing, batchId: crypto.randomUUID() });
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !account) return;
    setError(null);
    setBusy(true);
    setFileName(file.name);
    try {
      const grid = await readStatementFile(file);
      const saved = await loadMapping(account.id);
      const savedHeader = saved ? findHeaderRowForMapping(grid, saved) : -1;
      if (saved && savedHeader >= 0) {
        await prepareReview(grid, savedHeader, saved, account);
      } else {
        const headerRow = Math.max(0, findHeaderRow(grid));
        setStep({ kind: 'map', grid, headerRow, mapping: suggestMapping(grid, headerRow) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This file could not be read.');
    } finally {
      setBusy(false);
    }
  }

  async function onMappingConfirmed(headerRow: number, mapping: ColumnMapping) {
    if (step.kind !== 'map' || !account) return;
    setError(null);
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v !== undefined && v !== '')) as unknown as ColumnMapping;
      await saveMapping(account.id, clean);
      await prepareReview(step.grid, headerRow, clean, account);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (step.kind !== 'review' || !account) return;
    const payload = toPayload(step.rows, account.id, lookups.recipients);
    if (!payload.ok) {
      setProblems(payload.problems);
      return;
    }
    setProblems([]);
    try {
      const result = await commit.mutateAsync({
        batchId: step.batchId,
        accountId: account.id,
        fileName,
        rowCount: step.rows.length,
        skippedCount: step.rows.length - payload.rows.length,
        rows: payload.rows,
      });
      const firstDate = payload.rows.map((r) => r.date).sort()[0] ?? null;
      setStep({ kind: 'done', added: result.added, firstDate });
    } catch {
      // shown in the review step
    }
  }

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setStep((s) => (s.kind === 'review' ? { ...s, rows: s.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) } : s));
    setProblems([]);
  }

  function setAll(include: boolean) {
    setStep((s) => (s.kind === 'review' ? { ...s, rows: s.rows.map((r) => (r.status === 'imported' ? r : { ...r, include })) } : s));
  }

  function restart() {
    setStep({ kind: 'pick' });
    setError(null);
    setProblems([]);
    commit.reset();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 lg:max-w-6xl">
      <div>
        <PageHeader title="Import statement" />
        <p className="mt-1 text-sm text-slate-600">CSV or Excel (.xlsx) from your bank or card. The file is read on this device and not uploaded.</p>
      </div>
      <QueryState isLoading={lookups.isLoading} error={lookups.error} retry={lookups.refetch} />
      {error && <ErrorNotice title="Couldn't use this file">{error}</ErrorNotice>}

      {!lookups.isLoading && !lookups.error && step.kind === 'pick' && (
        <>
          {accounts.length === 0 ? (
            <EmptyState icon={<FileUp className="size-6" aria-hidden />} title="Add an account first">
              Statements are imported into one of your accounts.
            </EmptyState>
          ) : (
            <Card>
              <div className="space-y-4">
                <Field label="Account this statement is for">
                  {(id) => (
                    <SelectInput id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                      <option value="">Choose…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {ACCOUNT_TYPE_LABEL[a.type]}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                </Field>
                <div>
                  <label
                    htmlFor="statement-file"
                    className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center ${
                      account ? 'border-teal-300 bg-teal-50/50 text-teal-800 hover:bg-teal-50' : 'cursor-not-allowed border-slate-200 text-slate-400'
                    }`}
                  >
                    <FileUp className="size-6" aria-hidden />
                    <span className="font-semibold">{busy ? 'Reading…' : 'Choose statement file'}</span>
                    <span className="text-sm">{account ? '.csv or .xlsx' : 'Pick the account first'}</span>
                  </label>
                  <input
                    id="statement-file"
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf,text/csv"
                    className="sr-only"
                    disabled={!account || busy}
                    onChange={onFile}
                  />
                </div>
                <p className="text-sm text-slate-500">
                  Tip: in your bank app or net banking, open the account statement, pick the month, and download as CSV or Excel. PDF statements
                  can’t be read.
                </p>
              </div>
            </Card>
          )}
          <ImportHistory accounts={lookups.accounts} />
        </>
      )}

      {step.kind === 'map' && account && (
        <MappingStep
          grid={step.grid}
          initialHeaderRow={step.headerRow}
          initialMapping={step.mapping}
          accountIsCard={account.type === 'card'}
          onBack={restart}
          onConfirm={onMappingConfirmed}
        />
      )}

      {step.kind === 'review' && account && (
        <>
          <p className="text-sm">
            <button
              type="button"
              className="font-semibold text-teal-700 underline"
              onClick={() => setStep({ kind: 'map', grid: step.grid, headerRow: step.headerRow, mapping: step.mapping })}
            >
              Change which columns are which
            </button>
          </p>
          <ReviewStep
            account={account}
            rows={step.rows}
            errors={step.errors}
            ignoredLines={step.ignoredLines}
            existing={step.existing}
            accounts={lookups.accounts}
            categories={lookups.categories}
            recipientById={lookups.recipientById}
            problems={problems}
            busy={commit.isPending}
            failure={commit.error?.message ?? null}
            onChange={updateRow}
            onSetAll={setAll}
            onBack={restart}
            onImport={onImport}
          />
        </>
      )}

      {step.kind === 'done' && (
        <Card>
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CircleCheck className="size-10 text-emerald-600" aria-hidden />
            <p className="text-lg font-semibold">
              Imported {step.added} transaction{step.added === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-slate-600">You can undo this import below if something looks wrong.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <ButtonLink to={step.firstDate ? `/transactions?month=${monthKey(step.firstDate)}` : '/transactions'}>View transactions</ButtonLink>
              <Button variant="secondary" onClick={restart}>
                Import another file
              </Button>
            </div>
          </div>
        </Card>
      )}
      {step.kind === 'done' && <ImportHistory accounts={lookups.accounts} />}
    </div>
  );
}

function ImportHistory({ accounts }: { accounts: Account[] }) {
  const batches = useImportBatches();
  const undo = useUndoImport();
  if (batches.isLoading || !batches.data || batches.data.length === 0) return null;
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Account';

  return (
    <Card title="Past imports" action={<History className="size-4 text-slate-400" aria-hidden />}>
      <ul className="divide-y divide-slate-100">
        {batches.data.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{b.file_name}</span>
              <span className="block text-sm text-slate-500">
                {name(b.account_id)} · {formatShortDate(todayIST(new Date(b.created_at)))} · {b.added_count} added
                {b.skipped_count > 0 ? `, ${b.skipped_count} skipped` : ''}
              </span>
            </span>
            <Button
              variant="ghost"
              className="min-h-9 px-3 text-red-700"
              disabled={undo.isPending}
              onClick={() => {
                if (window.confirm(`Undo this import? The ${b.added_count} transactions it added will be removed. Entries you added yourself stay.`)) {
                  undo.mutate(b.id);
                }
              }}
            >
              Undo
            </Button>
          </li>
        ))}
      </ul>
      {undo.error && <ErrorNotice title="Couldn't undo">{undo.error.message}</ErrorNotice>}
    </Card>
  );
}
