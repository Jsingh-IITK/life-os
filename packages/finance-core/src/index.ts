/**
 * @life-os/finance-core — deterministic finance engine.
 *
 * Contract: this package performs no I/O. It imports no Supabase client, no
 * network, no filesystem, and no React. Every function takes explicit
 * user-scoped inputs and returns deterministic outputs, which is what makes the
 * accounting invariants unit-testable without a database.
 */

export * as Money from './money/index';
export * as Postings from './postings/index';
export * as Budgets from './budgets/index';
export type { Paise } from './money/paise';
export type { Leg, TransactionInput, TransactionType } from './postings/types';
