import { Repeat } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Field, Segmented, SelectInput, TextInput } from '../../components/form';
import { QueryState } from '../../components/LoadingBlock';
import { useDeleteRecurring, useRecurringItems, useSaveRecurring } from '../../data/recurring';
import { firstDueOnOrAfter } from '../../domain/recurring';
import {
  recurringToForm,
  validateRecurringForm,
  type RecurringFormField,
  type RecurringFormValues,
} from '../../domain/recurringForm';
import type { RecurringItem } from '../../domain/types';
import { useLookups } from '../../hooks/useLookups';
import { todayIST } from '../../lib/dates';

export function RecurringEditPage() {
  const { id } = useParams();
  const items = useRecurringItems();
  const lookups = useLookups();
  const isNew = id === undefined;
  const existing = items.data?.find((i) => i.id === id);
  const ready = items.isSuccess && !lookups.isLoading && !lookups.error;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={isNew ? 'Add reminder' : 'Edit reminder'} />
      <QueryState isLoading={items.isLoading || lookups.isLoading} error={items.error ?? lookups.error} retry={() => void items.refetch()} />
      {ready && !isNew && !existing && (
        <EmptyState icon={<Repeat className="size-6" aria-hidden />} title="Reminder not found">
          <Link to="/upcoming" className="font-semibold text-teal-700 underline">
            Back to upcoming
          </Link>
        </EmptyState>
      )}
      {ready && (isNew || existing) && <RecurringForm key={existing?.id ?? 'new'} existing={existing} lookups={lookups} />}
    </div>
  );
}

function RecurringForm({ existing, lookups }: { existing?: RecurringItem; lookups: ReturnType<typeof useLookups> }) {
  const navigate = useNavigate();
  const save = useSaveRecurring();
  const remove = useDeleteRecurring();
  const [values, setValues] = useState<RecurringFormValues>(() =>
    existing
      ? recurringToForm(existing)
      : {
          name: '',
          type: 'expense',
          amountText: '',
          accountId: lookups.accounts.find((a) => a.id === lookups.defaultAccountId && !a.archived)?.id ?? '',
          toAccountId: '',
          categoryId: '',
          dayOfMonth: '',
          nextDueDate: '',
          instalmentsText: '',
          active: true,
        },
  );
  const [errors, setErrors] = useState<Partial<Record<RecurringFormField, string>>>({});

  function set<K extends keyof RecurringFormValues>(key: K, value: RecurringFormValues[K]) {
    setValues((v) => {
      const next = { ...v, [key]: value };
      // Typing the day fills in the first due date (still editable).
      if (key === 'dayOfMonth') {
        const day = Number(value);
        if (Number.isInteger(day) && day >= 1 && day <= 31 && (!v.nextDueDate || !existing)) {
          next.nextDueDate = firstDueOnOrAfter(todayIST(), day);
        }
      }
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validateRecurringForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      await save.mutateAsync({ id: existing?.id, value: result.value });
      navigate('/upcoming');
    } catch {
      // shown below
    }
  }

  async function onDelete() {
    if (!existing || !window.confirm(`Delete the reminder "${existing.name}"? Payments already recorded stay.`)) return;
    try {
      await remove.mutateAsync(existing.id);
      navigate('/upcoming');
    } catch {
      // shown below
    }
  }

  const accounts = lookups.accounts.filter((a) => !a.archived || a.id === values.accountId || a.id === values.toAccountId);
  const categories = lookups.categories.filter((c) => c.kind === 'expense' && (!c.archived || c.id === values.categoryId));
  const failure = save.error ?? remove.error;

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Segmented
          label="Kind"
          value={values.type}
          options={[
            { value: 'expense', label: 'Bill / EMI / subscription' },
            { value: 'transfer', label: 'Transfer (e.g. SIP, savings)' },
          ]}
          onChange={(t) => set('type', t)}
        />
        <Field label="Name" error={errors.name}>
          {(id, d) => (
            <TextInput id={id} aria-describedby={d} error={errors.name} placeholder="e.g. Rent, Phone EMI, Netflix" value={values.name} onChange={(e) => set('name', e.target.value)} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" error={errors.amountText}>
            {(id, d) => (
              <TextInput id={id} aria-describedby={d} error={errors.amountText} inputMode="decimal" value={values.amountText} onChange={(e) => set('amountText', e.target.value)} />
            )}
          </Field>
          <Field label="Day of the month" error={errors.dayOfMonth} hint="29–31 falls on the last day in shorter months.">
            {(id, d) => (
              <TextInput id={id} aria-describedby={d} error={errors.dayOfMonth} inputMode="numeric" placeholder="e.g. 5" value={values.dayOfMonth} onChange={(e) => set('dayOfMonth', e.target.value)} />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={values.type === 'transfer' ? 'From account' : 'Paid from'} error={errors.accountId}>
            {(id, d) => (
              <SelectInput id={id} aria-describedby={d} error={errors.accountId} value={values.accountId} onChange={(e) => set('accountId', e.target.value)}>
                <option value="">Choose…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          {values.type === 'transfer' ? (
            <Field label="To account" error={errors.toAccountId}>
              {(id, d) => (
                <SelectInput id={id} aria-describedby={d} error={errors.toAccountId} value={values.toAccountId} onChange={(e) => set('toAccountId', e.target.value)}>
                  <option value="">Choose…</option>
                  {accounts.filter((a) => a.id !== values.accountId).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
          ) : (
            <Field label="Category">
              {(id) => (
                <SelectInput id={id} value={values.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next due date" error={errors.nextDueDate}>
            {(id, d) => (
              <TextInput id={id} aria-describedby={d} error={errors.nextDueDate} type="date" value={values.nextDueDate} onChange={(e) => set('nextDueDate', e.target.value)} />
            )}
          </Field>
          <Field label="Payments left (optional)" error={errors.instalmentsText} hint="For EMIs, including the next one. Leave empty if it never ends.">
            {(id, d) => (
              <TextInput id={id} aria-describedby={d} error={errors.instalmentsText} inputMode="numeric" value={values.instalmentsText} onChange={(e) => set('instalmentsText', e.target.value)} />
            )}
          </Field>
        </div>
        {values.type === 'expense' && (
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            Credit-card EMI? The purchase was already counted when you bought it. Make this reminder “Paid from” the card only if
            you want to track it — your card bill payment covers it. Loan EMIs from a bank account are counted as spending when
            marked as paid.
          </p>
        )}
        {existing && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-teal-700" checked={values.active} onChange={(e) => set('active', e.target.checked)} />
            Active (untick to pause)
          </label>
        )}
        {failure && <ErrorNotice title="Not saved">{failure.message}</ErrorNotice>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {existing && (
            <Button variant="danger" onClick={onDelete} disabled={remove.isPending} className="sm:mr-auto">
              Delete reminder
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate('/upcoming')}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending} className="sm:min-w-32">
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
