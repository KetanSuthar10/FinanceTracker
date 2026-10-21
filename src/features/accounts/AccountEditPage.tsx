import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Field, Segmented, TextInput } from '../../components/form';
import { QueryState } from '../../components/LoadingBlock';
import { useAccounts, useSaveAccount, useSetAccountArchived } from '../../data/accounts';
import { useSetDefaultAccount, useSettings } from '../../data/settings';
import {
  accountToForm,
  validateAccountForm,
  type AccountFormField,
  type AccountFormValues,
} from '../../domain/accountForm';
import { ACCOUNT_TYPE_LABEL, type Account, type AccountType } from '../../domain/types';
import { todayIST } from '../../lib/dates';
import { Wallet } from 'lucide-react';

const TYPE_OPTIONS = (['bank', 'cash', 'card'] as const).map((value) => ({ value, label: ACCOUNT_TYPE_LABEL[value] }));

export function AccountEditPage() {
  const { id } = useParams();
  const accounts = useAccounts();
  const settings = useSettings();
  const isNew = id === undefined;
  const existing = accounts.data?.find((a) => a.id === id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={isNew ? 'Add account' : 'Edit account'} />
      <QueryState
        isLoading={accounts.isLoading || settings.isLoading}
        error={accounts.error ?? settings.error}
        retry={() => void accounts.refetch()}
      />
      {!accounts.isLoading && !settings.isLoading && !isNew && !existing && !accounts.error && (
        <EmptyState icon={<Wallet className="size-6" aria-hidden />} title="Account not found">
          <Link to="/accounts" className="font-semibold text-teal-700 underline">
            Back to accounts
          </Link>
        </EmptyState>
      )}
      {accounts.data && settings.isSuccess && (isNew || existing) && (
        <AccountForm
          key={existing?.id ?? 'new'}
          existing={existing}
          isDefault={Boolean(existing && settings.data?.default_account_id === existing.id)}
          hasDefault={Boolean(settings.data?.default_account_id)}
        />
      )}
    </div>
  );
}

function AccountForm({ existing, isDefault, hasDefault }: { existing?: Account; isDefault: boolean; hasDefault: boolean }) {
  const navigate = useNavigate();
  const save = useSaveAccount();
  const archive = useSetAccountArchived();
  const setDefault = useSetDefaultAccount();
  const [values, setValues] = useState<AccountFormValues>(() =>
    existing
      ? accountToForm(existing)
      : { name: '', type: 'bank', openingAmountText: '', openingIsNegative: false, openingDate: todayIST(), nickname: '', cardDueDay: '' },
  );
  // A brand-new first account becomes the default automatically (it can be changed later).
  const [makeDefault, setMakeDefault] = useState(isDefault || (!existing && !hasDefault));
  const [errors, setErrors] = useState<Partial<Record<AccountFormField, string>>>({});

  function set<K extends keyof AccountFormValues>(key: K, value: AccountFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validateAccountForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: existing?.id, value: result.value });
      if (makeDefault && !isDefault) await setDefault.mutateAsync(saved.id);
      if (!makeDefault && isDefault) await setDefault.mutateAsync(null);
      navigate('/accounts');
    } catch {
      // shown below
    }
  }

  async function onToggleArchive() {
    if (!existing) return;
    if (!existing.archived && !window.confirm(`Archive ${existing.name}? It stays in your history but is hidden from new entries.`)) return;
    try {
      await archive.mutateAsync({ id: existing.id, archived: !existing.archived });
      if (!existing.archived && isDefault) await setDefault.mutateAsync(null);
      navigate('/accounts');
    } catch {
      // shown below
    }
  }

  const type: AccountType = values.type;
  const amountLabel = type === 'card' ? 'Amount owed on that date (₹)' : 'Balance on that date (₹)';
  const busy = save.isPending || archive.isPending || setDefault.isPending;
  const failure = save.error ?? archive.error ?? setDefault.error;

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {existing ? (
          <p className="text-sm text-slate-600">
            Type: <span className="font-semibold">{ACCOUNT_TYPE_LABEL[existing.type]}</span>
          </p>
        ) : (
          <Segmented label="Account type" value={type} options={TYPE_OPTIONS} onChange={(t) => set('type', t)} />
        )}

        <Field label="Name" error={errors.name}>
          {(id, d) => (
            <TextInput
              id={id}
              aria-describedby={d}
              error={errors.name}
              placeholder={type === 'card' ? 'e.g. ICICI Amazon Pay' : type === 'cash' ? 'e.g. Wallet' : 'e.g. HDFC Savings'}
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Starting date"
            error={errors.openingDate}
            hint="Only transactions from this date on are counted."
          >
            {(id, d) => (
              <TextInput
                id={id}
                aria-describedby={d}
                error={errors.openingDate}
                type="date"
                value={values.openingDate}
                onChange={(e) => set('openingDate', e.target.value)}
              />
            )}
          </Field>
          <Field
            label={amountLabel}
            error={errors.openingAmountText}
            hint={type === 'card' ? 'From your card app. 0 if nothing is owed.' : 'From your bank app or wallet.'}
          >
            {(id, d) => (
              <TextInput
                id={id}
                aria-describedby={d}
                error={errors.openingAmountText}
                inputMode="decimal"
                placeholder="0"
                value={values.openingAmountText}
                onChange={(e) => set('openingAmountText', e.target.value)}
              />
            )}
          </Field>
        </div>

        {type !== 'card' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-teal-700"
              checked={values.openingIsNegative}
              onChange={(e) => set('openingIsNegative', e.target.checked)}
            />
            The balance was overdrawn (below zero)
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Short name for quick add (optional)" error={errors.nickname} hint='e.g. "hdfc" — then "450 lunch hdfc" picks this account.'>
            {(id, d) => (
              <TextInput
                id={id}
                aria-describedby={d}
                error={errors.nickname}
                autoComplete="off"
                value={values.nickname}
                onChange={(e) => set('nickname', e.target.value)}
              />
            )}
          </Field>
          {type === 'card' && (
            <Field label="Bill due day (optional)" error={errors.cardDueDay} hint="Day of the month, for reminders.">
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  error={errors.cardDueDay}
                  inputMode="numeric"
                  placeholder="e.g. 5"
                  value={values.cardDueDay}
                  onChange={(e) => set('cardDueDay', e.target.value)}
                />
              )}
            </Field>
          )}
        </div>

        {!existing?.archived && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-teal-700"
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
            />
            Use as the default account for quick add
          </label>
        )}

        {failure && <ErrorNotice title="Not saved">{failure.message}</ErrorNotice>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {existing && (
            <Button variant={existing.archived ? 'secondary' : 'danger'} onClick={onToggleArchive} disabled={busy} className="sm:mr-auto">
              {existing.archived ? 'Restore account' : 'Archive account'}
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate('/accounts')}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} className="sm:min-w-32">
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
