import { Repeat } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/LoadingBlock';
import { useRecurringItems } from '../../data/recurring';
import { useLookups } from '../../hooks/useLookups';
import { formatDayLabel, todayIST } from '../../lib/dates';
import { paiseToInputText } from '../../lib/money';
import { TransactionEditor } from '../transactions/TransactionEditor';

/** "Mark as paid": a pre-filled, editable transaction that also moves the reminder to its next due date. */
export function PayRecurringPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const items = useRecurringItems();
  const lookups = useLookups();
  const item = items.data?.find((i) => i.id === id);
  const ready = items.isSuccess && !lookups.isLoading && !lookups.error;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={item ? `Pay ${item.name}` : 'Mark as paid'} subtitle={item ? `Due ${formatDayLabel(item.next_due_date)}` : undefined} />
      <QueryState isLoading={items.isLoading || lookups.isLoading} error={items.error ?? lookups.error} retry={() => void items.refetch()} />
      {ready && (!item || !item.active) && (
        <EmptyState icon={<Repeat className="size-6" aria-hidden />} title={item ? 'This reminder is paused or finished' : 'Reminder not found'}>
          <Link to="/upcoming" className="font-semibold text-teal-700 underline">
            Back to upcoming
          </Link>
        </EmptyState>
      )}
      {ready && item?.active && (
        <>
          <p className="text-sm text-slate-600">Check the details and save. The reminder then moves to next month.</p>
          <TransactionEditor
            key={`${item.id}-${item.next_due_date}`}
            accounts={lookups.accounts}
            categories={lookups.categories}
            recipients={lookups.recipients}
            defaultAccountId={lookups.defaultAccountId}
            initial={{
              type: item.type,
              amountText: paiseToInputText(item.amount_paise),
              date: todayIST(),
              accountId: item.account_id,
              toAccountId: item.to_account_id ?? '',
              categoryId: item.category_id ?? '',
              recipientName: item.type === 'expense' ? item.name : '',
              note: item.type === 'transfer' ? item.name : '',
            }}
            recurring={{ itemId: item.id, expectedDue: item.next_due_date }}
            onSaved={() => navigate('/upcoming')}
          />
        </>
      )}
    </div>
  );
}
