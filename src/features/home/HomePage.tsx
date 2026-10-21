import { Wallet } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { formatMonthLabel, todayIST } from '../../lib/dates';

export function HomePage() {
  const month = formatMonthLabel(todayIST());

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-slate-500">{month}</p>
        <h1 className="text-2xl font-bold">Home</h1>
      </header>

      <EmptyState icon={<Wallet className="size-6" aria-hidden />} title="You're signed in">
        Your accounts, spending and balances will show up here. Adding accounts and transactions is the next thing
        being built.
      </EmptyState>
    </div>
  );
}
