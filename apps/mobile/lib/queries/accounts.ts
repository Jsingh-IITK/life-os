import { Money, Postings } from '@life-os/finance-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ledgerCaches, queryKeys } from '@/lib/queries/keys';
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

export interface NewAccountInput {
  name: string;
  accountClass: AccountClass;
  /** Only for ASSET/LIABILITY — the satellite row type. */
  accountType?: 'bank' | 'cash' | 'credit_card' | 'wallet' | 'other';
  designation?: 'general' | 'emergency_fund' | 'travel_fund' | 'goal' | 'other';
}

/** Creates an account and its metadata row. */
export function useCreateAccount() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async (input: NewAccountInput) => {
      if (!userId) throw new Error('not signed in');

      const { data, error } = await supabase
        .from('ledger_accounts')
        .insert({ user_id: userId, account_class: input.accountClass, name: input.name.trim() })
        .select('id')
        .single();
      if (error) throw new Error(error.message);

      const id = data.id as string;

      if (input.accountClass === 'ASSET' || input.accountClass === 'LIABILITY') {
        const { error: satelliteError } = await supabase.from('financial_accounts').insert({
          ledger_account_id: id,
          user_id: userId,
          account_type:
            input.accountType ?? (input.accountClass === 'LIABILITY' ? 'credit_card' : 'bank'),
          designation: input.designation ?? 'general',
        });
        if (satelliteError) throw new Error(satelliteError.message);
      } else if (input.accountClass === 'EXPENSE' || input.accountClass === 'INCOME') {
        const { error: satelliteError } = await supabase
          .from('categories')
          .insert({ ledger_account_id: id, user_id: userId });
        if (satelliteError) throw new Error(satelliteError.message);
      }

      return id;
    },
    onSuccess: () => {
      if (!userId) return;
      for (const key of ledgerCaches(userId)) void client.invalidateQueries({ queryKey: key });
    },
  });
}

export function useRenameAccount() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('ledger_accounts')
        .update({ name: name.trim() })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: () => {
      if (!userId) return;
      for (const key of ledgerCaches(userId)) void client.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Archives rather than deletes.
 *
 * An account with postings cannot be deleted — the foreign key refuses it,
 * correctly, because removing it would silently change historical balances.
 * Archiving hides it from pickers while leaving history intact.
 */
export function useArchiveAccount() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('ledger_accounts')
        .update({ is_archived: archived })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: () => {
      if (!userId) return;
      for (const key of ledgerCaches(userId)) void client.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Records a starting balance.
 *
 * Posted against opening-balance equity, which is what lets a balance exist
 * from before you started tracking without inventing income to explain it.
 * A liability takes a negative amount: you owe it.
 */
export function useSetOpeningBalance() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async ({
      accountId,
      amount,
      date,
    }: {
      accountId: string;
      amount: Money.Paise;
      date: string;
    }) => {
      if (!userId) throw new Error('not signed in');

      const { data: equity, error: equityError } = await supabase
        .from('ledger_accounts')
        .select('id')
        .eq('account_class', 'EQUITY')
        .limit(1)
        .single();
      if (equityError) throw new Error(`No opening-balance account found: ${equityError.message}`);

      const legs = Postings.buildPostings({
        type: 'opening_balance',
        amount,
        accountId,
        equityAccountId: equity.id as string,
      });

      const { error } = await supabase.rpc('post_transaction', {
        payload: {
          txn_date: date,
          type: 'opening_balance',
          description: 'Opening balance',
          postings: Postings.toRpcPostings(legs),
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      if (!userId) return;
      for (const key of ledgerCaches(userId)) void client.invalidateQueries({ queryKey: key });
    },
  });
}
