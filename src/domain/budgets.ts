import type { Breakdown } from './summary';
import type { Budget } from './types';

export type BudgetStatus = 'ok' | 'near' | 'over';

export interface BudgetProgress {
  categoryId: string;
  limitPaise: number;
  spentPaise: number;
  /** Whole percent used, 0 or more (can exceed 100). */
  percent: number;
  status: BudgetStatus;
}

/** Under 80% = ok, 80–100% = near, above 100% = over (docs/PRODUCT.md → Budgets). */
export function budgetStatus(spentPaise: number, limitPaise: number): BudgetStatus {
  if (spentPaise > limitPaise) return 'over';
  if (spentPaise * 100 >= limitPaise * 80) return 'near';
  return 'ok';
}

export function budgetProgress(budgets: Budget[], spendingByCategory: Breakdown[]): BudgetProgress[] {
  const spent = new Map(spendingByCategory.map((b) => [b.id, b.amountPaise]));
  return budgets
    .map((b) => {
      const spentPaise = Math.max(0, spent.get(b.category_id) ?? 0);
      return {
        categoryId: b.category_id,
        limitPaise: b.monthly_limit_paise,
        spentPaise,
        percent: Math.floor((spentPaise * 100) / b.monthly_limit_paise),
        status: budgetStatus(spentPaise, b.monthly_limit_paise),
      };
    })
    .sort((a, b) => b.percent - a.percent);
}
