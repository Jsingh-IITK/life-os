/**
 * Query keys, centralised so invalidation after a write cannot miss a cache.
 *
 * Every key is scoped by user id. Two accounts on one device must never share
 * a cache entry, and RLS would not save us from showing a stale page.
 */
export const queryKeys = {
  /** Aggregates derived from postings. */
  monthSummary: (userId: string) => ['month-summary', userId] as const,
  budget: (userId: string) => ['budget', userId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  accounts: (userId: string) => ['accounts', userId] as const,
  balances: (userId: string) => ['balances', userId] as const,
  transactions: (userId: string) => ['transactions', userId] as const,
} as const;

/**
 * Every cache that a change to the ledger invalidates.
 *
 * Balances, budgets and the monthly summary are all derived from postings, so
 * a write to any transaction makes all of them wrong at once. Listing them
 * here means a new mutation cannot forget one — which is how "2 this month"
 * ended up displayed above three transactions.
 */
export function ledgerCaches(userId: string) {
  return [
    queryKeys.balances(userId),
    queryKeys.transactions(userId),
    queryKeys.monthSummary(userId),
    queryKeys.budget(userId),
  ];
}
