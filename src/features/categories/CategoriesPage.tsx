import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { ErrorNotice } from '../../components/ErrorNotice';
import { TextInput } from '../../components/form';
import { QueryState } from '../../components/LoadingBlock';
import { useCategories, useSaveCategory, useSetCategoryArchived } from '../../data/categories';
import type { Category, CategoryKind } from '../../domain/types';

export function CategoriesPage() {
  const categories = useCategories();
  return (
    <div className="mx-auto max-w-2xl space-y-5 lg:max-w-5xl">
      <PageHeader title="Categories" />
      <QueryState isLoading={categories.isLoading} error={categories.error} retry={() => void categories.refetch()} />
      {categories.data && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <CategoryGroup title="Spending" kind="expense" all={categories.data} />
          <CategoryGroup title="Income" kind="income" all={categories.data} />
        </div>
      )}
    </div>
  );
}

function CategoryGroup({ title, kind, all }: { title: string; kind: CategoryKind; all: Category[] }) {
  const save = useSaveCategory();
  const archive = useSetCategoryArchived();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const items = all.filter((c) => c.kind === kind);
  const active = items.filter((c) => !c.archived);
  const archived = items.filter((c) => c.archived);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await save.mutateAsync({ name: newName, kind });
      setNewName('');
    } catch {
      // shown below
    }
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await save.mutateAsync({ id: editing.id, name: editing.name, kind });
      setEditing(null);
    } catch {
      // shown below
    }
  }

  return (
    <Card title={title}>
      <ul className="divide-y divide-slate-100">
        {active.map((c) => (
          <li key={c.id} className="py-2">
            {editing?.id === c.id ? (
              <form onSubmit={rename} className="flex gap-2">
                <TextInput
                  aria-label={`New name for ${c.name}`}
                  value={editing.name}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                  autoFocus
                />
                <Button type="submit" disabled={save.isPending}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-words">{c.name}</span>
                <Button variant="ghost" className="min-h-9 px-3" onClick={() => setEditing({ id: c.id, name: c.name })}>
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-9 px-3 text-slate-500"
                  onClick={() => archive.mutate({ id: c.id, archived: true })}
                  aria-label={`Archive ${c.name}`}
                >
                  Archive
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="mt-3 flex gap-2">
        <TextInput
          aria-label={`New ${title.toLowerCase()} category`}
          placeholder="New category"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={save.isPending || !newName.trim()}>
          Add
        </Button>
      </form>

      {(save.error || archive.error) && (
        <div className="mt-3">
          <ErrorNotice title="Not saved">{(save.error ?? archive.error)?.message}</ErrorNotice>
        </div>
      )}

      {archived.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-slate-500">Archived ({archived.length})</summary>
          <ul className="mt-2 space-y-1">
            {archived.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-slate-500">{c.name}</span>
                <Button variant="ghost" className="min-h-9 px-3" onClick={() => archive.mutate({ id: c.id, archived: false })}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-3 text-xs text-slate-500">Archived categories stay on past transactions but are hidden when adding new ones.</p>
    </Card>
  );
}
