import type { Paise } from '../money/paise';

/**
 * A single ledger leg. Signed, debit-positive.
 *
 * Natural balance is sum(amount) for ASSET and EXPENSE accounts, and
 * -sum(amount) for LIABILITY, INCOME and EQUITY.
 */
export interface Leg {
  readonly accountId: string;
  readonly amount: Paise;
  readonly memo?: string;
}

export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'cc_purchase'
  | 'cc_repayment'
  | 'investment_buy'
  | 'investment_sell'
  | 'refund'
  | 'adjustment'
  | 'opening_balance';

/**
 * What the user did, expressed in their terms — not in debits and credits.
 *
 * Each variant names the accounts by their role, so a caller cannot
 * accidentally swap the two sides of a transfer or post an expense against a
 * liability. Turning these into balanced legs is this module's whole job.
 */
export type TransactionInput =
  | {
      readonly type: 'expense';
      readonly amount: Paise;
      readonly categoryAccountId: string;
      readonly paidFromAccountId: string;
    }
  | {
      readonly type: 'income';
      readonly amount: Paise;
      readonly incomeAccountId: string;
      readonly depositedToAccountId: string;
    }
  | {
      readonly type: 'transfer';
      readonly amount: Paise;
      readonly fromAccountId: string;
      readonly toAccountId: string;
    }
  | {
      readonly type: 'cc_purchase';
      readonly amount: Paise;
      readonly categoryAccountId: string;
      readonly cardAccountId: string;
    }
  | {
      readonly type: 'cc_repayment';
      readonly amount: Paise;
      readonly cardAccountId: string;
      readonly paidFromAccountId: string;
    }
  | {
      readonly type: 'investment_buy';
      readonly amount: Paise;
      readonly investmentAccountId: string;
      readonly paidFromAccountId: string;
    }
  | {
      readonly type: 'investment_sell';
      readonly proceeds: Paise;
      /** Cost basis of the units disposed of, from the lot engine. */
      readonly costBasis: Paise;
      readonly investmentAccountId: string;
      readonly depositedToAccountId: string;
      readonly realizedGainAccountId: string;
    }
  | {
      readonly type: 'refund';
      readonly amount: Paise;
      /** The category the original expense was booked to. */
      readonly categoryAccountId: string;
      readonly refundedToAccountId: string;
    }
  | {
      readonly type: 'opening_balance';
      readonly amount: Paise;
      readonly accountId: string;
      readonly equityAccountId: string;
    }
  | {
      /** Escape hatch for corrections. The caller supplies balanced legs. */
      readonly type: 'adjustment';
      readonly legs: readonly Leg[];
    };

export class PostingError extends Error {
  override readonly name = 'PostingError';
}
