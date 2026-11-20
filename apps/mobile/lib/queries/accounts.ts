import { Money } from '@life-os/finance-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queries/keys';
import { useUserId } from '@/lib/auth/session';
import { supabase } from '@/lib/supabase';

export type AccountClass = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY';

export interface LedgerAccount {
  id: string;
  name: string;
  accountClass: AccountClass;
  parentId: string | null;
}

export interface AccountBalance extends LedgerAccount {
  /** Natural balance in paise: positive means the account holds what its class implies. */
  balance: Money.Paise;
}

/** Whether this user has completed onboarding — i.e. has a chart of accounts. */
export function useHasChartOfAccounts() {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.accounts(userId ?? 'anonymous'),
    enabled: userId !== null,
    queryFn: async (): Promise<LedgerAccount[]> => {
      const { data, error } = await supabase
        .from('ledger_accounts')
        .select('id, name, account_class, parent_id')
        .order('account_class')
        .order('name');

      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        accountClass: row.account_class as AccountClass,
        parentId: (row.parent_id as string | null) ?? null,
      }));
    },
  });
}

/**
 * Balances, read from the account_balances view.
 *
 * The view derives every figure from postings, so there is no stored balance
 * that could disagree with the ledger. Amounts arrive as BIGINT — returned by
 * the client as a string or number — and go through Money.fromDatabase, which
 * rejects anything that would lose precision as a JS number.
 */
export function useAccountBalances() {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.balances(userId ?? 'anonymous'),
    enabled: userId !== null,
    queryFn: async (): Promise<AccountBalance[]> => {
      const { data, error } = await supabase
        .from('account_balances')
        .select('ledger_account_id, name, account_class, parent_id, natural_balance');

      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => ({
        id: row.ledger_account_id as string,
        name: row.name as string,
        accountClass: row.account_class as AccountClass,
        parentId: (row.parent_id as string | null) ?? null,
        balance: Money.fromDatabase((row.natural_balance ?? 0) as string | number),
      }));
    },
  });
}

/** Sum of balances for one account class. */
export function totalFor(balances: readonly AccountBalance[], cls: AccountClass): Money.Paise {
  return Money.sum(balances.filter((b) => b.accountClass === cls).map((b) => b.balance));
}

/**
 * Net worth: assets minus liabilities.
 *
 * Both are natural balances, so a liability with money owed is positive and
 * must be subtracted. Summing raw posting amounts instead would silently get
 * the sign wrong.
 */
export function netWorth(balances: readonly AccountBalance[]): Money.Paise {
  return Money.subtract(totalFor(balances, 'ASSET'), totalFor(balances, 'LIABILITY'));
}

export interface OnboardOptions {
  bankName?: string;
  withCard?: boolean;
  withCash?: boolean;
  withInvestments?: boolean;
}

/** Builds the starting chart of accounts via the onboard_finance RPC. */
export function useOnboard() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async (options: OnboardOptions) => {
      const { data, error } = await supabase.rpc('onboard_finance', {
        payload: {
          bank_name: options.bankName ?? 'Savings account',
          with_card: options.withCard ?? true,
          with_cash: options.withCash ?? false,
          with_investments: options.withInvestments ?? true,
        },
      });

      if (error) throw new Error(error.message);
      return data as { accounts_created: number; bank_account_id: string };
    },
    onSuccess: () => {
      if (!userId) return;
      // Both caches are now wrong: accounts exist and balances are derived
      // from them.
      void client.invalidateQueries({ queryKey: queryKeys.accounts(userId) });
      void client.invalidateQueries({ queryKey: queryKeys.balances(userId) });
    },
  });
}
