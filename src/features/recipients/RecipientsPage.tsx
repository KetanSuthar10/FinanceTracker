import { ChevronRight, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Card, PageHeader } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { TextInput } from '../../components/form';
import { QueryState } from '../../components/LoadingBlock';
import { normalizeName } from '../../domain/recipients';
import { useLookups } from '../../hooks/useLookups';

export function RecipientsPage() {
  const lookups = useLookups();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = normalizeName(q);
    return lookups.recipients.filter(
      (r) => !needle || normalizeName(r.name).includes(needle) || r.aliases.some((a) => a.includes(needle)),
    );
  }, [lookups.recipients, q]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <PageHeader title="Recipients" />
        <p className="mt-1 text-sm text-slate-600">Who you pay and get paid by, and the category remembered for each.</p>
      </div>
      <QueryState isLoading={lookups.isLoading} error={lookups.error} retry={lookups.refetch} />
      {!lookups.isLoading && !lookups.error && lookups.recipients.length === 0 && (
        <EmptyState icon={<Users className="size-6" aria-hidden />} title="No recipients yet">
          They're added automatically when you save a transaction with a name.
        </EmptyState>
      )}
      {lookups.recipients.length > 0 && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <TextInput type="search" aria-label="Search recipients" placeholder="Search" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Card>
            <ul className="-mx-2">
              {list.map((r) => (
                <li key={r.id}>
                  <Link to={`/recipients/${r.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-sm text-slate-500">
                        {lookups.categoryById.get(r.default_category_id ?? '')?.name ?? 'No category remembered'}
                        {r.aliases.length > 0 && ` · also "${r.aliases.join('", "')}"`}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
              {list.length === 0 && <li className="px-2 py-3 text-sm text-slate-500">No matches.</li>}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
