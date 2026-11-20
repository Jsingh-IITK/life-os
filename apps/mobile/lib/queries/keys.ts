/**
 * Query keys, centralised so invalidation after a write cannot miss a cache.
 *
 * Every key is scoped by user id. Two accounts on one device must never share
 * a cache entry, and RLS would not save us from showing a stale page.
 */
export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  accounts: (userId: string) => ['accounts', userId] as const,
  balances: (userId: string) => ['balances', userId] as const,
  transactions: (userId: string) => ['transactions', userId] as const,
} as const;
