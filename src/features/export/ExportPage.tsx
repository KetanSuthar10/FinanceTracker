import { CircleCheck, Download, ShieldCheck, Upload } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { Button } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Field, TextInput } from '../../components/form';
import { QueryState } from '../../components/LoadingBlock';
import { downloadFile, fetchBackupData, useRestoreBackup } from '../../data/backup';
import { fetchAllPages } from '../../data/db';
import { buildBackup, transactionsToCsv, validateBackup, type BackupFile, type BackupSummary } from '../../domain/backup';
import type { Transaction } from '../../domain/types';
import { useLookups } from '../../hooks/useLookups';
import { formatShortDate, isValidISODate, monthRange, todayIST } from '../../lib/dates';
import { getSupabase } from '../../lib/supabase';

export function ExportPage() {
  const lookups = useLookups();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <PageHeader title="Backup & export" />
        <p className="mt-1 text-sm text-slate-600">
          The free database plan doesn’t keep backups for you. Download a full backup once a month and keep it somewhere private.
        </p>
      </div>
      <QueryState isLoading={lookups.isLoading} error={lookups.error} retry={lookups.refetch} />
      {!lookups.isLoading && !lookups.error && (
        <>
          <BackupCard />
          <CsvCard lookups={lookups} />
          <RestoreCard isEmpty={lookups.accounts.length === 0} />
        </>
      )}
    </div>
  );
}

function BackupCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onBackup() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const backup = await buildBackup(await fetchBackupData());
      downloadFile(`finance-backup-${todayIST()}.json`, JSON.stringify(backup, null, 1), 'application/json');
      setDone(`Backup saved: ${backup.data.transactions.length} transactions, ${backup.data.accounts.length} accounts.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Full backup">
      <p className="text-sm text-slate-600">
        Everything — accounts, transactions, categories, recipients, reminders, budgets and import settings — in one file that can be restored
        later. It contains your financial data, so don’t share it.
      </p>
      <Button className="mt-4" onClick={onBackup} disabled={busy}>
        <Download className="size-4" aria-hidden />
        {busy ? 'Preparing…' : 'Download backup'}
      </Button>
      {done && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-emerald-800">
          <CircleCheck className="size-4" aria-hidden /> {done}
        </p>
      )}
      {error && (
        <div className="mt-3">
          <ErrorNotice title="Backup failed">{error}</ErrorNotice>
        </div>
      )}
    </Card>
  );
}

function CsvCard({ lookups }: { lookups: ReturnType<typeof useLookups> }) {
  const month = monthRange(todayIST());
  const [from, setFrom] = useState(month.from);
  const [through, setThrough] = useState(month.through);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onExport() {
    setError(null);
    if (!isValidISODate(from) || !isValidISODate(through) || from > through) {
      setError('Choose a start date on or before the end date.');
      return;
    }
    setBusy(true);
    try {
      const rows = (await fetchAllPages((start, end) =>
        getSupabase()
          .from('transactions')
          .select('date, type, amount_paise, account_id, to_account_id, category_id, recipient_id, note, source')
          .gte('date', from)
          .lte('date', through)
          .order('date')
          .order('id')
          .range(start, end),
      )) as unknown as Transaction[];
      if (rows.length === 0) {
        setError('No transactions in those dates.');
        return;
      }
      downloadFile(`transactions-${from}-to-${through}.csv`, '\uFEFF' + transactionsToCsv(rows, lookups), 'text/csv');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Transactions as CSV">
      <p className="text-sm text-slate-600">Opens in Excel or Google Sheets. Amounts are in rupees.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="From">{(id) => <TextInput id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To">{(id) => <TextInput id={id} type="date" value={through} onChange={(e) => setThrough(e.target.value)} />}</Field>
      </div>
      <Button variant="secondary" className="mt-4" onClick={onExport} disabled={busy}>
        <Download className="size-4" aria-hidden />
        {busy ? 'Preparing…' : 'Download CSV'}
      </Button>
      {error && (
        <div className="mt-3">
          <ErrorNotice title="Nothing exported">{error}</ErrorNotice>
        </div>
      )}
    </Card>
  );
}

function RestoreCard({ isEmpty }: { isEmpty: boolean }) {
  const restore = useRestoreBackup();
  const [checked, setChecked] = useState<{ backup: BackupFile; summary: BackupSummary } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setChecked(null);
    setProblems([]);
    setDone(false);
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setProblems(['This file is too large to be a backup.']);
      return;
    }
    const result = await validateBackup(await file.text());
    if (result.ok) setChecked({ backup: result.backup, summary: result.summary });
    else setProblems(result.problems);
  }

  async function onRestore() {
    if (!checked) return;
    try {
      await restore.mutateAsync(checked.backup.data);
      setDone(true);
      setChecked(null);
    } catch {
      // shown below
    }
  }

  return (
    <Card title="Restore from a backup">
      {done ? (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-800">
          <CircleCheck className="size-5" aria-hidden /> Restored. Everything from the backup is back.
        </p>
      ) : !isEmpty ? (
        <p className="text-sm text-slate-600">
          Restore only works on an empty app (for example after moving to a new database), so it can never mix two sets of records.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">Pick a backup file. It’s checked completely before anything is written.</p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ring-1 ring-slate-300 hover:bg-slate-50">
            <Upload className="size-4" aria-hidden /> Choose backup file
            <input type="file" accept=".json,application/json" className="sr-only" onChange={onFile} />
          </label>
          {problems.length > 0 && (
            <div className="mt-3">
              <ErrorNotice title="This backup can’t be restored">
                <ul className="list-disc pl-5">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </ErrorNotice>
            </div>
          )}
          {checked && (
            <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold text-emerald-800">
                <ShieldCheck className="size-5" aria-hidden /> Backup checked — everything is consistent
              </p>
              <p className="mt-2 text-slate-700">
                Made {formatShortDate(todayIST(new Date(checked.summary.exportedAt)))}: {checked.summary.accounts} accounts,{' '}
                {checked.summary.transactions} transactions
                {checked.summary.firstDate && checked.summary.lastDate
                  ? ` (${formatShortDate(checked.summary.firstDate)} – ${formatShortDate(checked.summary.lastDate)})`
                  : ''}
                , {checked.summary.categories} categories, {checked.summary.reminders} reminders, {checked.summary.budgets} budgets.
              </p>
              <Button className="mt-3" onClick={onRestore} disabled={restore.isPending}>
                {restore.isPending ? 'Restoring…' : 'Restore this backup'}
              </Button>
            </div>
          )}
          {restore.error && (
            <div className="mt-3">
              <ErrorNotice title="Not restored — nothing was changed">{restore.error.message}</ErrorNotice>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
