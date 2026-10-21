import { CircleCheck, Mic, Square, Wand2 } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Field, Segmented, SelectInput, TextArea, TextInput } from '../../components/form';
import { useDeleteTransaction, useSaveTransaction, type RecurringPayment } from '../../data/transactions';
import { parseQuickText, type DraftField } from '../../domain/parseQuickText';
import { findRecipient } from '../../domain/recipients';
import {
  validateTransactionForm,
  type TransactionFormField,
  type TransactionFormValues,
} from '../../domain/transactionForm';
import {
  ACCOUNT_TYPE_LABEL,
  categoryKindFor,
  TRANSACTION_TYPE_LABEL,
  type Account,
  type Category,
  type Recipient,
  type Transaction,
  type TransactionSource,
  type TransactionType,
} from '../../domain/types';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { todayIST } from '../../lib/dates';
import { formatINR, paiseToInputText } from '../../lib/money';

const TYPE_OPTIONS = (['expense', 'income', 'transfer', 'refund'] as const).map((value) => ({
  value,
  label: TRANSACTION_TYPE_LABEL[value],
}));

const MISSING_LABEL: Record<DraftField, string> = {
  amount: 'amount',
  account: 'account',
  toAccount: 'where the money goes',
  category: 'category',
};

interface Props {
  accounts: Account[];
  categories: Category[];
  recipients: Recipient[];
  defaultAccountId: string | null;
  /** When editing. */
  existing?: Transaction;
  /** Pre-filled values for a new entry (e.g. from a bill reminder). */
  initial?: Partial<TransactionFormValues>;
  /** When marking a recurring reminder as paid. */
  recurring?: RecurringPayment;
  /** Called after a successful save instead of resetting for the next entry. */
  onSaved?: () => void;
}

function emptyValues(accountId: string): TransactionFormValues {
  return {
    type: 'expense',
    amountText: '',
    date: todayIST(),
    accountId,
    toAccountId: '',
    categoryId: '',
    recipientName: '',
    note: '',
  };
}

function valuesFrom(t: Transaction, recipients: Recipient[]): TransactionFormValues {
  return {
    type: t.type,
    amountText: paiseToInputText(t.amount_paise),
    date: t.date,
    accountId: t.account_id,
    toAccountId: t.to_account_id ?? '',
    categoryId: t.category_id ?? '',
    recipientName: recipients.find((r) => r.id === t.recipient_id)?.name ?? '',
    note: t.note ?? '',
  };
}

export function TransactionEditor({ accounts, categories, recipients, defaultAccountId, existing, initial, recurring, onSaved }: Props) {
  const navigate = useNavigate();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const quickRef = useRef<HTMLInputElement>(null);
  const showQuickAdd = !existing && !recurring;

  const activeDefault = accounts.find((a) => a.id === defaultAccountId && !a.archived)?.id ?? '';
  const [values, setValues] = useState<TransactionFormValues>(() =>
    existing ? valuesFrom(existing, recipients) : { ...emptyValues(activeDefault), ...initial },
  );
  const [errors, setErrors] = useState<Partial<Record<TransactionFormField, string>>>({});
  const [quickText, setQuickText] = useState('');
  const [draftNotes, setDraftNotes] = useState<string[]>([]);
  const [source, setSource] = useState<TransactionSource>('manual');
  const [saved, setSaved] = useState<string | null>(null);

  const speech = useSpeechRecognition((text) => {
    setQuickText(text);
    fill(text, 'voice');
  });

  const kind = categoryKindFor(values.type);
  const accountOptions = accounts.filter((a) => !a.archived || a.id === values.accountId || a.id === values.toAccountId);
  const categoryOptions = useMemo(
    () => categories.filter((c) => c.kind === kind && (!c.archived || c.id === values.categoryId)),
    [categories, kind, values.categoryId],
  );

  function set<K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setSaved(null);
  }

  function changeType(type: TransactionType) {
    setValues((v) => {
      const keepCategory = categories.find((c) => c.id === v.categoryId)?.kind === categoryKindFor(type);
      return { ...v, type, categoryId: keepCategory ? v.categoryId : '', toAccountId: type === 'transfer' ? v.toAccountId : '' };
    });
    setErrors({});
    setSaved(null);
  }

  function changeRecipient(name: string) {
    setValues((v) => {
      const known = findRecipient(name, recipients);
      const remembered = known && categories.find((c) => c.id === known.default_category_id && !c.archived);
      const useMemory = !v.categoryId && remembered && remembered.kind === categoryKindFor(v.type);
      return { ...v, recipientName: name, categoryId: useMemory ? remembered.id : v.categoryId };
    });
    setErrors((e) => ({ ...e, recipientName: undefined, categoryId: undefined }));
    setSaved(null);
  }

  function fill(text: string, from: TransactionSource) {
    if (!text.trim()) return;
    const draft = parseQuickText(text, {
      today: todayIST(),
      accounts,
      defaultAccountId,
      recipients,
      categories,
    });
    setValues({
      type: draft.type,
      amountText: draft.amountPaise === null ? '' : paiseToInputText(draft.amountPaise),
      date: draft.date,
      accountId: draft.accountId ?? '',
      toAccountId: draft.toAccountId ?? '',
      categoryId: draft.categoryId ?? '',
      recipientName: draft.recipientName,
      note: draft.note,
    });
    setErrors({});
    setSaved(null);
    setSource(from);
    const notes = [...draft.warnings];
    if (draft.missing.length > 0) notes.push(`Please fill in: ${draft.missing.map((m) => MISSING_LABEL[m]).join(', ')}.`);
    setDraftNotes(notes);
  }

  function onQuickSubmit(e: FormEvent) {
    e.preventDefault();
    fill(quickText, 'manual');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const result = validateTransactionForm(values, { accounts, categories, source });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      const savedRow = await save.mutateAsync({
        id: existing?.id,
        value: { ...result.value, source: recurring ? 'recurring' : result.value.source },
        recipients,
        recurring,
      });
      if (onSaved) {
        onSaved();
        return;
      }
      if (existing) {
        navigate(-1);
        return;
      }
      const who = result.value.recipientName ?? (savedRow.type === 'transfer' ? 'Transfer' : TRANSACTION_TYPE_LABEL[savedRow.type]);
      setSaved(`Saved ${savedRow.type === 'expense' ? '−' : ''}${formatINR(savedRow.amount_paise)} · ${who}`);
      // Ready for the next entry: keep the account and date, clear the rest.
      setValues((v) => ({ ...emptyValues(v.accountId), date: v.date }));
      setQuickText('');
      setDraftNotes([]);
      setSource('manual');
      quickRef.current?.focus();
    } catch {
      // Error is shown from save.error; the form keeps what was typed.
    }
  }

  async function onDelete() {
    if (!existing) return;
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    try {
      await remove.mutateAsync(existing.id);
      navigate('/transactions', { replace: true });
    } catch {
      // shown below
    }
  }

  const accountLabel = (a: Account) => `${a.name} · ${ACCOUNT_TYPE_LABEL[a.type]}${a.archived ? ' (archived)' : ''}`;

  return (
    <div className="space-y-4">
      {showQuickAdd && (
        <Card>
          <form onSubmit={onQuickSubmit}>
            <label htmlFor="quick-text" className="mb-1 block text-sm font-medium text-slate-700">
              Quick add — type or speak
            </label>
            <div className="flex gap-2">
              <TextInput
                id="quick-text"
                ref={quickRef}
                value={speech.listening ? speech.interim : quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder="e.g. 120 cafe upi"
                autoComplete="off"
                enterKeyHint="go"
                readOnly={speech.listening}
                aria-describedby="quick-hint"
              />
              {speech.supported && (
                <Button
                  variant={speech.listening ? 'danger' : 'secondary'}
                  onClick={speech.listening ? speech.stop : speech.start}
                  aria-label={speech.listening ? 'Stop listening' : 'Speak'}
                  className="shrink-0 px-3"
                >
                  {speech.listening ? <Square className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
                </Button>
              )}
              <Button type="submit" variant="secondary" className="shrink-0 px-3" aria-label="Fill the form">
                <Wand2 className="size-5" aria-hidden />
                <span className="hidden sm:inline">Fill</span>
              </Button>
            </div>
            <p id="quick-hint" className="mt-2 text-sm text-slate-500">
              {speech.listening
                ? 'Listening… say something like "450 groceries yesterday".'
                : 'Try "450 groceries yesterday", "got 50k salary" or "transfer 2000 hdfc to cash". You can check everything before saving.'}
            </p>
          </form>
          {speech.error && <p className="mt-2 text-sm text-red-700">{speech.error}</p>}
          {draftNotes.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" aria-live="polite">
              {draftNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {saved && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
          <CircleCheck className="size-5 shrink-0" aria-hidden />
          {saved}
        </div>
      )}

      <Card>
        <form onSubmit={onSave} className="space-y-4" noValidate>
          <Segmented label="Type" value={values.type} options={TYPE_OPTIONS} onChange={changeType} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₹)" error={errors.amountText}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  error={errors.amountText}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={values.amountText}
                  onChange={(e) => set('amountText', e.target.value)}
                />
              )}
            </Field>
            <Field label="Date" error={errors.date}>
              {(id, d) => (
                <TextInput
                  id={id}
                  aria-describedby={d}
                  error={errors.date}
                  type="date"
                  value={values.date}
                  onChange={(e) => set('date', e.target.value)}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={values.type === 'transfer' ? 'From account' : 'Account'} error={errors.accountId}>
              {(id, d) => (
                <SelectInput
                  id={id}
                  aria-describedby={d}
                  error={errors.accountId}
                  value={values.accountId}
                  onChange={(e) => set('accountId', e.target.value)}
                >
                  <option value="">Choose…</option>
                  {accountOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            {values.type === 'transfer' && (
              <Field label="To account" error={errors.toAccountId} hint="Paying a card bill? Choose the card here.">
                {(id, d) => (
                  <SelectInput
                    id={id}
                    aria-describedby={d}
                    error={errors.toAccountId}
                    value={values.toAccountId}
                    onChange={(e) => set('toAccountId', e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {accountOptions
                      .filter((a) => a.id !== values.accountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {accountLabel(a)}
                        </option>
                      ))}
                  </SelectInput>
                )}
              </Field>
            )}
          </div>

          {values.type !== 'transfer' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={values.type === 'income' ? 'From (payer)' : 'Paid to'}
                error={errors.recipientName}
                hint="The category is remembered for next time."
              >
                {(id, d) => (
                  <>
                    <TextInput
                      id={id}
                      aria-describedby={d}
                      error={errors.recipientName}
                      list="recipient-suggestions"
                      autoComplete="off"
                      placeholder={values.type === 'income' ? 'e.g. Employer' : 'e.g. Third Wave Coffee'}
                      value={values.recipientName}
                      onChange={(e) => changeRecipient(e.target.value)}
                    />
                    <datalist id="recipient-suggestions">
                      {recipients.map((r) => (
                        <option key={r.id} value={r.name} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
              <Field label="Category" error={errors.categoryId}>
                {(id, d) => (
                  <SelectInput
                    id={id}
                    aria-describedby={d}
                    error={errors.categoryId}
                    value={values.categoryId}
                    onChange={(e) => set('categoryId', e.target.value)}
                  >
                    <option value="">Uncategorised</option>
                    {categoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>
            </div>
          )}

          <Field label="Note (optional)" error={errors.note}>
            {(id, d) => (
              <TextArea
                id={id}
                aria-describedby={d}
                error={errors.note}
                rows={2}
                value={values.note}
                onChange={(e) => set('note', e.target.value)}
              />
            )}
          </Field>

          {(save.error || remove.error) && (
            <ErrorNotice title="Not saved">{(save.error ?? remove.error)?.message}</ErrorNotice>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {existing && (
              <>
                <Button variant="danger" onClick={onDelete} disabled={remove.isPending} className="sm:mr-auto">
                  {remove.isPending ? 'Deleting…' : 'Delete'}
                </Button>
                <Button variant="secondary" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
              </>
            )}
            <Button type="submit" disabled={save.isPending} className="sm:min-w-32">
              {save.isPending ? 'Saving…' : existing ? 'Save changes' : recurring ? 'Save payment' : 'Save'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
