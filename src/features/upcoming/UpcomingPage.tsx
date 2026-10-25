import { CalendarClock, CreditCard, Plus, Repeat } from 'lucide-react';
import { Link } from 'react-router';
import { Money } from '../../components/Amount';
import { Button, ButtonLink } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { QueryState } from '../../components/LoadingBlock';
import { useSkipRecurring } from '../../data/recurring';
import { totalRecurringDue, type UpcomingEntry } from '../../domain/recurring';
import type { RecurringItem } from '../../domain/types';
import { useLookups } from '../../hooks/useLookups';
import { formatDayLabel } from '../../lib/dates';
import { formatINR, paiseToInputText } from '../../lib/money';
import { reminderSummary, useUpcoming } from './useUpcoming';

const UPCOMING_DAYS = 30;

export function UpcomingPage() {
  const lookups = useLookups();
  const { entries, items, today, isLoading, error, refetch } = useUpcoming(UPCOMING_DAYS);
  const skip = useSkipRecurring();
  const total = totalRecurringDue(entries);

  return (
    <div className="mx-auto max-w-3xl space-y-5 lg:max-w-6xl">
      <PageHeader
        title="Upcoming"
        action={
          <ButtonLink to="/recurring/new">
            <Plus className="size-4" aria-hidden /> Add reminder
          </ButtonLink>
        }
      />
      <QueryState isLoading={isLoading || lookups.isLoading} error={error ?? lookups.error} retry={refetch} />

      {!isLoading && !error && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card title={`Next ${UPCOMING_DAYS} days`}>
            {entries.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nothing due. Add rent, EMIs, subscriptions and bills as reminders, and set a due day on your credit cards.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  Bills and EMIs due: <span className="font-semibold text-slate-900">{formatINR(total)}</span>
                  <span className="text-slate-500"> (card bills shown separately — their purchases are already counted)</span>
                </p>
                <ul className="divide-y divide-slate-100">
                  {entries.map((e) => (
                    <EntryRow
                      key={`${e.kind}-${e.kind === 'recurring' ? e.item.id : e.account.id}-${e.date}`}
                      entry={e}
                      today={today}
                      lookups={lookups}
                      onSkip={(item) => {
                        if (window.confirm(`Skip ${item.name} for this month? Nothing is recorded.`)) {
                          skip.mutate({ id: item.id, expectedDue: item.next_due_date });
                        }
                      }}
                      skipping={skip.isPending}
                    />
                  ))}
                </ul>
              </>
            )}
            {skip.error && (
              <div className="mt-3">
                <ErrorNotice title="Couldn't skip">{skip.error.message}</ErrorNotice>
              </div>
            )}
          </Card>

          <Card title="All reminders">
            {items.length === 0 ? (
              <EmptyState icon={<Repeat className="size-6" aria-hidden />} title="No reminders yet">
                Rent, EMIs, SIPs, subscriptions, phone and electricity bills — anything you pay every month.
              </EmptyState>
            ) : (
              <ul className="-mx-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link to={`/recurring/${item.id}`} className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.name}</span>
                        <span className="block truncate text-sm text-slate-500">
                          {reminderSummary(item)}
                        </span>
                      </span>
                      <Money paise={item.amount_paise} className="font-semibold" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  today,
  lookups,
  onSkip,
  skipping,
}: {
  entry: UpcomingEntry;
  today: string;
  lookups: ReturnType<typeof useLookups>;
  onSkip: (item: RecurringItem) => void;
  skipping: boolean;
}) {
  const overdue = entry.date < today;
  const when = (
    <span className={overdue ? 'font-semibold text-red-700' : ''}>
      {overdue ? `Overdue · ${formatDayLabel(entry.date, today)}` : formatDayLabel(entry.date, today)}
    </span>
  );

  if (entry.kind === 'card') {
    const { account, outstandingPaise } = entry;
    return (
      <li className="flex flex-wrap items-center gap-3 py-3">
        <CreditCard className="size-5 shrink-0 text-teal-700" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{account.name} bill</span>
          <span className="block text-sm text-slate-500">
            {when} · {outstandingPaise > 0 ? `Outstanding ${formatINR(outstandingPaise)}` : 'Nothing owed right now'}
          </span>
        </span>
        {outstandingPaise > 0 && (
          <ButtonLink
            variant="secondary"
            className="min-h-9 w-full px-3 sm:w-auto"
            to={`/add?type=transfer&to=${account.id}&amount=${paiseToInputText(outstandingPaise)}`}
          >
            Record payment
          </ButtonLink>
        )}
      </li>
    );
  }

  const { item, isNext } = entry;
  const account = lookups.accountById.get(item.account_id)?.name;
  const category = item.category_id ? lookups.categoryById.get(item.category_id)?.name : null;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <CalendarClock className="size-5 shrink-0 text-teal-700" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{item.name}</span>
        <span className="block text-sm text-slate-500">
          {when} · {[category, account].filter(Boolean).join(' · ')}
          {item.instalments_left !== null && isNext ? ` · ${item.instalments_left} left` : ''}
        </span>
      </span>
      <Money paise={item.amount_paise} className="font-semibold" />
      {isNext && (
        <span className="flex w-full gap-2 sm:w-auto">
          <ButtonLink to={`/recurring/${item.id}/pay`} className="min-h-9 flex-1 px-3 sm:flex-none">
            Mark as paid
          </ButtonLink>
          <Button variant="ghost" className="min-h-9 px-3" onClick={() => onSkip(item)} disabled={skipping}>
            Skip
          </Button>
        </span>
      )}
    </li>
  );
}
