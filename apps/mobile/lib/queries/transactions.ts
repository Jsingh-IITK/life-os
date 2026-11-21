import { Money, Postings } from '@life-os/finance-core';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/lib/auth/session';
import { queryKeys } from '@/lib/queries/keys';
import { supabase } from '@/lib/supabase';

export interface TransactionRow {
  id: string;
  date: string;
  type: Postings.TransactionType;
  description: string | null;
  merchant: string | null;
  paymentMethod: string | null;
  /**
   * Magnitude, always positive. The ledger's debit-positive signing is an
   * accounting convention, not a display one: an income credit is negative in
   * the ledger but is money arriving, and showing it as "-1,25,000" in green
   * is simply wrong to read.
   */
  amount: Money.Paise;
  /** How it reads to the user. A transfer is neither in nor out. */
  direction: 'in' | 'out' | 'neutral';
  categoryName: string | null;
}

/** Maps a transaction type to how its amount should read. */
function directionFor(type: Postings.TransactionType): 'in' | 'out' | 'neutral' {
  switch (type) {
    case 'income':
    case 'refund':
    case 'investment_sell':
      return 'in';
    case 'expense':
    case 'cc_purchase':
      return 'out';
    // Transfers, card repayments and investment purchases move money without
    // it being earned or spent.
    default:
      return 'neutral';
  }
}

/**
 * Recent transactions with the amount and category derived from their legs.
 *
 * The amount shown is the expense leg where one exists, otherwise the asset
 * movement. A transfer therefore shows what moved without implying it was
 * spent — the row reflects the ledger rather than reinterpreting it.
 */
export function useTransactions(limit = 20) {
  const userId = useUserId();

  return useQuery({
    queryKey: [...queryKeys.transactions(userId ?? 'anonymous'), limit],
    enabled: userId !== null,
    queryFn: async (): Promise<TransactionRow[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select(
          `id, txn_date, type, description, merchant, payment_method,
           postings ( amount, ledger_accounts ( name, account_class ) )`,
        )
        .is('deleted_at', null)
        .order('txn_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error(error.message);

      return (data ?? []).map(mapTransactionRow);
    },
  });
}

/**
 * PostgREST types an embedded relation as an array even when the foreign key
 * makes it many-to-one, so the runtime shape can be either. Normalising here
 * keeps that detail out of the mapping below.
 */
interface RawAccount {
  name: string;
  account_class: string;
}

interface RawLeg {
  amount: string | number;
  ledger_accounts: RawAccount | RawAccount[] | null;
}

function accountOf(leg: RawLeg | undefined): RawAccount | null {
  if (!leg) return null;
  const rel = leg.ledger_accounts;
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/** Shared by the recent list and the paginated history. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTransactionRow(row: any): TransactionRow {
  const legs = (row.postings ?? []) as RawLeg[];

  const classOf = (leg: RawLeg | undefined) => accountOf(leg)?.account_class;
  const expenseLeg = legs.find((l) => classOf(l) === 'EXPENSE');
  const incomeLeg = legs.find((l) => classOf(l) === 'INCOME');
  const assetLeg = legs.find((l) => classOf(l) === 'ASSET');
  const chosen = expenseLeg ?? incomeLeg ?? assetLeg ?? legs[0];

  const type = row.type as Postings.TransactionType;

  return {
    id: row.id as string,
    date: row.txn_date as string,
    type,
    description: (row.description as string | null) ?? null,
    merchant: (row.merchant as string | null) ?? null,
    paymentMethod: (row.payment_method as string | null) ?? null,
    amount: Money.abs(Money.fromDatabase(chosen?.amount ?? 0)),
    direction: directionFor(type),
    categoryName: accountOf(chosen)?.name ?? null,
  };
}

export interface NewTransaction {
  input: Postings.TransactionInput;
  date: string;
  description?: string;
  merchant?: string;
  /** NULL means unspecified. Never inferred — guessing invents a fact. */
  paymentMethod?: string | null;
}

/**
 * Records a transaction.
 *
 * The legs are built by finance-core, which is where the accounting rules
 * live, and written by the post_transaction RPC, which inserts header and legs
 * in one server-side transaction. The Supabase client cannot open a
 * multi-statement transaction, so writing them separately could leave an
 * unbalanced transaction persisted.
 */
export function usePostTransaction() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async (entry: NewTransaction) => {
      // Throws before any network call if the legs do not balance.
      const legs = Postings.buildPostings(entry.input);

      const { data, error } = await supabase.rpc('post_transaction', {
        payload: {
          txn_date: entry.date,
          type: entry.input.type,
          description: entry.description ?? null,
          merchant: entry.merchant ?? null,
          payment_method: entry.paymentMethod ?? null,
          postings: Postings.toRpcPostings(legs),
        },
      });

      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      if (!userId) return;
      // Balances are derived from postings, so both caches are now stale.
      void client.invalidateQueries({ queryKey: queryKeys.balances(userId) });
      void client.invalidateQueries({ queryKey: queryKeys.transactions(userId) });
    },
  });
}

/** One transaction with its legs, for editing. */
export interface TransactionDetail {
  id: string;
  date: string;
  type: Postings.TransactionType;
  merchant: string | null;
  paymentMethod: string | null;
  legs: { accountId: string; amount: Money.Paise }[];
}

export function useTransaction(id: string | undefined) {
  const userId = useUserId();

  return useQuery({
    queryKey: [...queryKeys.transactions(userId ?? 'anonymous'), 'detail', id],
    enabled: userId !== null && !!id,
    queryFn: async (): Promise<TransactionDetail> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, txn_date, type, merchant, payment_method, postings ( ledger_account_id, amount )')
        .eq('id', id!)
        .single();

      if (error) throw new Error(error.message);

      const legs = (data.postings ?? []) as unknown as {
        ledger_account_id: string;
        amount: string | number;
      }[];

      return {
        id: data.id as string,
        date: data.txn_date as string,
        type: data.type as Postings.TransactionType,
        merchant: (data.merchant as string | null) ?? null,
        paymentMethod: (data.payment_method as string | null) ?? null,
        legs: legs.map((l) => ({
          accountId: l.ledger_account_id,
          amount: Money.fromDatabase(l.amount),
        })),
      };
    },
  });
}

/** Amends a transaction. The legs are rebuilt, not patched. */
export function useUpdateTransaction() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async ({ id, entry }: { id: string; entry: NewTransaction }) => {
      const legs = Postings.buildPostings(entry.input);

      const { error } = await supabase.rpc('update_transaction', {
        p_transaction_id: id,
        payload: {
          txn_date: entry.date,
          type: entry.input.type,
          merchant: entry.merchant ?? null,
          payment_method: entry.paymentMethod ?? null,
          postings: Postings.toRpcPostings(legs),
        },
      });

      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: () => {
      if (!userId) return;
      void client.invalidateQueries({ queryKey: queryKeys.balances(userId) });
      void client.invalidateQueries({ queryKey: queryKeys.transactions(userId) });
    },
  });
}

/** Soft delete. The postings survive, so this is reversible. */
export function useDeleteTransaction() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_transaction', { p_transaction_id: id });
      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: () => {
      if (!userId) return;
      void client.invalidateQueries({ queryKey: queryKeys.balances(userId) });
      void client.invalidateQueries({ queryKey: queryKeys.transactions(userId) });
    },
  });
}

/** A page boundary: the last row seen, used to anchor the next page. */
interface Cursor {
  date: string;
  id: string;
}

export const HISTORY_PAGE_SIZE = 25;

/**
 * Full transaction history, paginated by keyset rather than OFFSET.
 *
 * OFFSET re-scans and skips every preceding row, so page 40 costs forty pages
 * of work, and a transaction inserted while you are reading shifts every
 * subsequent page by one — duplicating or hiding a row. Anchoring on the last
 * row seen avoids both: each page asks for "older than this", which stays
 * correct no matter what else is written.
 *
 * The anchor is (txn_date, id) because txn_date alone is not unique — several
 * transactions share a day, and ordering by a non-unique key leaves the page
 * boundary ambiguous.
 */
export function useTransactionHistory(pageSize = HISTORY_PAGE_SIZE) {
  const userId = useUserId();

  return useInfiniteQuery({
    queryKey: [...queryKeys.transactions(userId ?? 'anonymous'), 'history', pageSize],
    enabled: userId !== null,
    initialPageParam: null as Cursor | null,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('transactions')
        .select(
          `id, txn_date, type, description, merchant, payment_method,
           postings ( amount, ledger_accounts ( name, account_class ) )`,
        )
        .is('deleted_at', null)
        .order('txn_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(pageSize);

      if (pageParam) {
        // Strictly older: an earlier date, or the same date with a lower id.
        query = query.or(
          `txn_date.lt.${pageParam.date},and(txn_date.eq.${pageParam.date},id.lt.${pageParam.id})`,
        );
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return (data ?? []).map(mapTransactionRow);
    },
    getNextPageParam: (lastPage) => {
      // A short page is the last page; asking again would return nothing.
      if (lastPage.length < pageSize) return undefined;
      const last = lastPage[lastPage.length - 1];
      return last ? { date: last.date, id: last.id } : undefined;
    },
  });
}
