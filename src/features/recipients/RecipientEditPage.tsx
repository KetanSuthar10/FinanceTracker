import { Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Field, SelectInput, TextInput } from '../../components/form';
import { QueryState } from '../../components/LoadingBlock';
import { useDeleteRecipient, useSaveRecipient } from '../../data/recipients';
import { parseAliases } from '../../domain/recipients';
import type { Category, Recipient } from '../../domain/types';
import { useLookups } from '../../hooks/useLookups';

export function RecipientEditPage() {
  const { id } = useParams();
  const lookups = useLookups();
  const recipient = lookups.recipients.find((r) => r.id === id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Edit recipient" />
      <QueryState isLoading={lookups.isLoading} error={lookups.error} retry={lookups.refetch} />
      {!lookups.isLoading && !lookups.error && !recipient && (
        <EmptyState icon={<Users className="size-6" aria-hidden />} title="Recipient not found">
          <Link to="/recipients" className="font-semibold text-teal-700 underline">
            Back to recipients
          </Link>
        </EmptyState>
      )}
      {recipient && <RecipientForm key={recipient.id} recipient={recipient} categories={lookups.categories} />}
    </div>
  );
}

function RecipientForm({ recipient, categories }: { recipient: Recipient; categories: Category[] }) {
  const navigate = useNavigate();
  const save = useSaveRecipient();
  const remove = useDeleteRecipient();
  const [name, setName] = useState(recipient.name);
  const [aliases, setAliases] = useState(recipient.aliases.join(', '));
  const [categoryId, setCategoryId] = useState(recipient.default_category_id ?? '');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({ id: recipient.id, name, aliases: parseAliases(aliases), default_category_id: categoryId || null });
      navigate('/recipients');
    } catch {
      // shown below
    }
  }

  async function onDelete() {
    if (!window.confirm(`Forget ${recipient.name}? Past transactions keep their amounts but lose this name.`)) return;
    try {
      await remove.mutateAsync(recipient.id);
      navigate('/recipients');
    } catch {
      // shown below
    }
  }

  const options = categories.filter((c) => !c.archived || c.id === categoryId);

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Other names (optional)" hint='Comma-separated, e.g. "twc, third wave". Quick add matches any of them.'>
          {(id, d) => <TextInput id={id} aria-describedby={d} value={aliases} onChange={(e) => setAliases(e.target.value)} />}
        </Field>
        <Field label="Remembered category" hint="Pre-filled next time you add a transaction for this recipient.">
          {(id, d) => (
            <SelectInput id={id} aria-describedby={d} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              <optgroup label="Spending">
                {options.filter((c) => c.kind === 'expense').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Income">
                {options.filter((c) => c.kind === 'income').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </SelectInput>
          )}
        </Field>
        <p className="text-sm text-slate-500">Changing the remembered category does not change past transactions.</p>

        {(save.error || remove.error) && <ErrorNotice title="Not saved">{(save.error ?? remove.error)?.message}</ErrorNotice>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="danger" onClick={onDelete} disabled={remove.isPending} className="sm:mr-auto">
            Forget recipient
          </Button>
          <Button variant="secondary" onClick={() => navigate('/recipients')}>
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
