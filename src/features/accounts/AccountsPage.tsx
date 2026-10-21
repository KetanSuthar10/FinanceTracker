import { ChevronRight, CreditCard, Landmark, Plus, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { ButtonLink } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/LoadingBlock';
import { usePositions } from '../../data/accounts';
import { useSettings } from '../../data/settings';
import { ACCOUNT_TYPE_LABEL, type Account } from '../../domain/types';
import { BalanceText } from './BalanceText';

const ICON = { bank: Landmark, cash: Wallet, card: CreditCard };

export function AccountsPage() {
  const { accounts, positions, isLoading, error, refetch } = usePositions();
  const settings = useSettings();
  const active = (accounts ?? []).filter((a) => !a.archived);
  const archived = (accounts ?? []).filter((a) => a.archived);

  const row = (a: Account) => {
    const Icon = ICON[a.type];
    const isDefault = settings.data?.default_account_id === a.id;
    return (
      <li key={a.id}>
        <Link to={`/accounts/${a.id}`} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-slate-50">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{a.name}</span>
            <span className="block truncate text-sm text-slate-500">
              {[
                ACCOUNT_TYPE_LABEL[a.type],
                isDefault ? 'Default' : null,
                a.type === 'card' && a.card_due_day ? `due on the ${a.card_due_day}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <BalanceText type={a.type} balancePaise={positions?.balances.get(a.id) ?? 0} className="text-sm font-semibold" />
          <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Accounts"
        action={
          <ButtonLink to="/accounts/new">
            <Plus className="size-4" aria-hidden /> Add account
          </ButtonLink>
        }
      />
      <QueryState isLoading={isLoading} error={error} retry={() => void refetch()} />
      {!isLoading && !error && active.length === 0 && archived.length === 0 && (
        <EmptyState icon={<Wallet className="size-6" aria-hidden />} title="No accounts yet">
          Add your bank accounts, cash and credit cards to start tracking.
        </EmptyState>
      )}
      {active.length > 0 && (
        <Card>
          <ul className="-mx-2">{active.map(row)}</ul>
        </Card>
      )}
      {archived.length > 0 && (
        <Card title="Archived">
          <ul className="-mx-2">{archived.map(row)}</ul>
        </Card>
      )}
    </div>
  );
}
