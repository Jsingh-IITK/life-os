import { Money } from '@life-os/finance-core';
import { useQuery } from '@tanstack/react-query';

import { useUserId } from '@/lib/auth/session';
import { queryKeys } from '@/lib/queries/keys';
import { supabase } from '@/lib/supabase';

export interface MonthSummary {
  income: Money.Paise;
  expenses: Money.Paise;
  realizedGains: Money.Paise;
  transactionCount: number;
  /** Income minus spending. Negative when you spent more than you earned. */
  saved: Money.Paise;
  /** 0–1, or null when there was no income to measure against. */
  savingsRate: number | null;
}

const EMPTY: MonthSummary = {
  income: 0 as Money.Paise,
  expenses: 0 as Money.Paise,
  realizedGains: 0 as Money.Paise,
  transactionCount: 0,
  saved: 0 as Money.Paise,
  savingsRate: null,
};

/** This month's income and spending, aggregated in the database. */
export function useMonthSummary(month: string) {
  const userId = useUserId();

  return useQuery({
    queryKey: [...queryKeys.monthSummary(userId ?? 'anonymous'), month],
    enabled: userId !== null,
    queryFn: async (): Promise<MonthSummary> => {
      const { data, error } = await supabase
        .from('month_summary')
        .select('income, expenses, realized_gains, transaction_count')
        .eq('period_month', month)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return EMPTY;

      const income = Money.fromDatabase(data.income as string | number);
      const expenses = Money.fromDatabase(data.expenses as string | number);
      const saved = Money.subtract(income, expenses);

      return {
        income,
        expenses,
        realizedGains: Money.fromDatabase(data.realized_gains as string | number),
        transactionCount: (data.transaction_count as number) ?? 0,
        saved,
        // Null rather than zero when there is no income: a savings rate of 0%
        // claims you saved nothing, which is a different statement from
        // having nothing to measure.
        savingsRate: Money.isZero(income) ? null : saved / income,
      };
    },
  });
}
