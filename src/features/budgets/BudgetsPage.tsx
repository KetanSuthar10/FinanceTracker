import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Card, PageHeader } from '../../components/Card';
import { ErrorNotice } from '../../components/ErrorNotice';
import { TextInput } from '../../components/form';
import { QueryState } from '../../components/LoadingBlock';
import { useBudgets, useSetBudget } from '../../data/budgets';
import { useTransactionsBetween } from '../../data/transactions';
import { budgetProgress } from '../../domain/budgets';
import { summarizePeriod } from '../../domain/summary';
import type { Budget, Category } from '../../domain/types';
import { useLookups } from '../../hooks/useLookups';
import { formatMonthLabel, monthRange, todayIST } from '../../lib/dates';
import { formatINR, paiseToInputText, parseRupeesToPaise } from '../../lib/money';
import { BudgetBar } from './BudgetBar';

export function BudgetsPage() {
  const lookups = useLookups();
  const budgets = useBudgets();
  const { from, through } = monthRange(todayIST());
  const transactions = useTransactionsBetween(from, through);
  const summary = useMemo(() => summarizePeriod(transactions.data ?? [], from, through), [transactions.data, from, through]);
  const progress = useMemo(
    () => new Map(budgetProgress(budgets.data ?? [], summary.spendingByCategory).map((p) => [p.categoryId, p])),
    [budgets.data, summary],
  );
  const spent = new Map(summary.spendingByCategory.map((b) => [b.id, b.amountPaise]));
  const categories = lookups.categories.filter((c) => c.kind === 'expense' && !c.archived);
  const isLoading = lookups.isLoading || budgets.isLoading || transactions.isLoading;
  const error = lookups.error ?? budgets.error ?? transactions.error;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <PageHeader title="Budgets" />
        <p className="mt-1 text-sm text-slate-600">
          Optional monthly limits per category. Progress for {formatMonthLabel(from)} shows on Home.
        </p>
      </div>
      <QueryState isLoading={isLoading} error={error} retry={() => { lookups.refetch(); void budgets.refetch(); }} />
      {!isLoading && !error && (
        <Card>
          <ul className="divide-y divide-slate-100">
            {categories.map((c) => (
              <BudgetRow
                key={c.id}
                category={c}
                budget={budgets.data?.find((b) => b.category_id === c.id)}
                spentPaise={Math.max(0, spent.get(c.id) ?? 0)}
                progress={progress.get(c.id)}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function BudgetRow({
  category,
  budget,
  spentPaise,
  progress,
}: {
  category: Category;
  budget?: Budget;
  spentPaise: number;
  progress?: ReturnType<typeof budgetProgress>[number];
}) {
  const setBudget = useSetBudget();
  const [text, setText] = useState(budget ? paiseToInputText(budget.monthly_limit_paise) : '');
  const [error, setError] = useState<string | null>(null);
  const saved = budget ? paiseToInputText(budget.monthly_limit_paise) : '';
  const dirty = text.trim() !== saved;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = text.trim();
    const limit = trimmed === '' ? null : parseRupeesToPaise(trimmed);
    if (trimmed !== '' && limit === null) {
      setError('Enter an amount like 5000, or leave empty for no limit.');
      return;
    }
    try {
      await setBudget.mutateAsync({ categoryId: category.id, limitPaise: limit });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not saved.');
    }
  }

  return (
    <li className="py-3">
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{category.name}</span>
          <span className="block truncate text-sm text-slate-500">Spent {formatINR(spentPaise)}</span>
        </span>
        <div className="w-24 shrink-0 sm:w-32">
          <TextInput
            aria-label={`Monthly limit for ${category.name}`}
            inputMode="decimal"
            placeholder="No limit"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" className="min-h-10 shrink-0 px-3" disabled={!dirty || setBudget.isPending}>
          {setBudget.isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>
      {progress && (
        <div className="mt-2">
          <BudgetBar progress={progress} />
        </div>
      )}
      {error && (
        <div className="mt-2">
          <ErrorNotice title="Not saved">{error}</ErrorNotice>
        </div>
      )}
    </li>
  );
}
