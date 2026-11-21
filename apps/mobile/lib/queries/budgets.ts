import { Budgets, Money } from '@life-os/finance-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/lib/auth/session';
import { queryKeys } from '@/lib/queries/keys';
import { supabase } from '@/lib/supabase';

/** First day of a month, in local time. */
export function monthKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}-01`;
}

export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  if (!y || !m) return iso;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

const budgetKey = (userId: string, month: string) =>
  [...queryKeys.budget(userId), month] as const;

export interface BudgetView {
  budgetId: string | null;
  summary: Budgets.BudgetSummary;
}

/** The month's budget with each allocation's actual spend. */
export function useBudget(month: string) {
  const userId = useUserId();

  return useQuery({
    queryKey: budgetKey(userId ?? 'anonymous', month),
    enabled: userId !== null,
    queryFn: async (): Promise<BudgetView> => {
      const { data, error } = await supabase
        .from('budget_status')
        .select('budget_id, allocation_id, ledger_account_id, category_name, planned, actual, rollover')
        .eq('period_month', month);

      if (error) throw new Error(error.message);

      const rows = data ?? [];

      // The arithmetic lives in finance-core, not here: the view supplies
      // planned and actual, and every derived figure comes from one tested
      // implementation rather than being recomputed per screen.
      const summary = Budgets.budgetSummary(
        rows.map((r) => ({
          categoryId: r.ledger_account_id as string,
          categoryName: r.category_name as string,
          planned: Money.fromDatabase(r.planned as string | number),
          actual: Money.fromDatabase(r.actual as string | number),
          rollover: (r.rollover as boolean) ?? false,
        })),
      );

      return { budgetId: (rows[0]?.budget_id as string | undefined) ?? null, summary };
    },
  });
}

export interface AllocationDraft {
  categoryId: string;
  planned: Money.Paise;
}

/**
 * Creates the month's budget and its allocations.
 *
 * Upserts the budget so a second attempt in the same month amends rather than
 * failing on the one-per-month constraint.
 */
export function useSaveBudget(month: string) {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async (allocations: AllocationDraft[]) => {
      if (!userId) throw new Error('not signed in');

      const { data: budget, error: budgetError } = await supabase
        .from('budgets')
        .upsert({ user_id: userId, period_month: month }, { onConflict: 'user_id,period_month' })
        .select('id')
        .single();

      if (budgetError) throw new Error(budgetError.message);
      const budgetId = budget.id as string;

      // Replace the month's allocations wholesale: a partial update would
      // leave a category the user removed still counting against them.
      const { error: clearError } = await supabase
        .from('budget_allocations')
        .delete()
        .eq('budget_id', budgetId);
      if (clearError) throw new Error(clearError.message);

      const rows = allocations
        .filter((a) => a.planned > 0)
        .map((a) => ({
          user_id: userId,
          budget_id: budgetId,
          ledger_account_id: a.categoryId,
          planned: a.planned,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from('budget_allocations').insert(rows);
        if (error) throw new Error(error.message);
      }

      return budgetId;
    },
    onSuccess: () => {
      if (!userId) return;
      void client.invalidateQueries({ queryKey: budgetKey(userId, month) });
    },
  });
}
