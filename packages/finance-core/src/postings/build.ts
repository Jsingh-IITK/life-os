import { ZERO, isPositive, negate, paise, subtract, sum, type Paise } from '../money/paise';
import { PostingError, type Leg, type TransactionInput } from './types';

/**
 * Turn a transaction into balanced legs.
 *
 * This is the single place the accounting invariants are expressed, and they
 * hold structurally rather than by convention:
 *
 *   - a transfer produces asset→asset legs and touches no expense account, so
 *     it cannot be counted as spending;
 *   - a card repayment produces liability→asset legs with no expense leg, so it
 *     cannot double-count expenditure already recognised at purchase;
 *   - an investment purchase produces asset→asset legs, so it is not a
 *     lifestyle expense;
 *   - a refund credits the original category, so it nets spending down rather
 *     than appearing as income.
 *
 * There is no code path that can produce a transfer with an expense leg,
 * because no branch below writes one.
 */
export function buildPostings(input: TransactionInput): Leg[] {
  const legs = legsFor(input);
  assertBalanced(legs);
  return legs;
}

function legsFor(input: TransactionInput): Leg[] {
  switch (input.type) {
    // Spending reduces cash and increases expenditure.
    case 'expense':
      requirePositive(input.amount, 'expense amount');
      return [
        { accountId: input.categoryAccountId, amount: input.amount },
        { accountId: input.paidFromAccountId, amount: negate(input.amount) },
      ];

    // Earning increases cash and recorded income.
    case 'income':
      requirePositive(input.amount, 'income amount');
      return [
        { accountId: input.depositedToAccountId, amount: input.amount },
        { accountId: input.incomeAccountId, amount: negate(input.amount) },
      ];

    // Asset to asset. No income leg, no expense leg — this is the invariant.
    case 'transfer':
      requirePositive(input.amount, 'transfer amount');
      if (input.fromAccountId === input.toAccountId) {
        throw new PostingError('a transfer must move money between two different accounts');
      }
      return [
        { accountId: input.toAccountId, amount: input.amount },
        { accountId: input.fromAccountId, amount: negate(input.amount) },
      ];

    // Expenditure is recognised when the purchase happens, not when the card
    // is paid. The liability rises by the same amount.
    case 'cc_purchase':
      requirePositive(input.amount, 'purchase amount');
      return [
        { accountId: input.categoryAccountId, amount: input.amount },
        { accountId: input.cardAccountId, amount: negate(input.amount) },
      ];

    // Settles the liability from cash. No expense leg exists here, which is
    // precisely why paying a card cannot duplicate the original spending.
    case 'cc_repayment':
      requirePositive(input.amount, 'repayment amount');
      return [
        { accountId: input.cardAccountId, amount: input.amount },
        { accountId: input.paidFromAccountId, amount: negate(input.amount) },
      ];

    // Moves value from cash into an investment asset. Not a lifestyle expense.
    case 'investment_buy':
      requirePositive(input.amount, 'investment amount');
      return [
        { accountId: input.investmentAccountId, amount: input.amount },
        { accountId: input.paidFromAccountId, amount: negate(input.amount) },
      ];

    // Cash in, holding out at its cost basis, and the difference recognised as
    // realized gain or loss. A loss simply makes the gain leg a debit.
    case 'investment_sell': {
      requirePositive(input.proceeds, 'proceeds');
      if (input.costBasis < 0) {
        throw new PostingError('cost basis cannot be negative');
      }
      const gain = subtract(input.proceeds, input.costBasis);
      const legs: Leg[] = [
        { accountId: input.depositedToAccountId, amount: input.proceeds },
        { accountId: input.investmentAccountId, amount: negate(input.costBasis) },
      ];
      // A break-even disposal has no gain leg at all; a zero-amount posting
      // carries no information and the database rejects it.
      if (gain !== ZERO) {
        legs.push({ accountId: input.realizedGainAccountId, amount: negate(gain) });
      }
      return legs;
    }

    // Credits the original category, so spending nets down instead of the
    // refund appearing as income.
    case 'refund':
      requirePositive(input.amount, 'refund amount');
      return [
        { accountId: input.refundedToAccountId, amount: input.amount },
        { accountId: input.categoryAccountId, amount: negate(input.amount) },
      ];

    // The counterweight that lets a first balance exist without inventing
    // income. Equity absorbs it.
    case 'opening_balance': {
      if (input.amount === ZERO) {
        throw new PostingError('an opening balance of zero has nothing to record');
      }
      return [
        { accountId: input.accountId, amount: input.amount },
        { accountId: input.equityAccountId, amount: negate(input.amount) },
      ];
    }

    case 'adjustment':
      return [...input.legs];
  }
}

function requirePositive(amount: Paise, what: string): void {
  if (!isPositive(amount)) {
    throw new PostingError(
      `${what} must be positive — direction is determined by the transaction type, not the sign`,
    );
  }
}

/**
 * The structural guarantee, mirrored from the database's deferred constraint so
 * an unbalanced transaction is caught before it is ever sent.
 */
export function assertBalanced(legs: readonly Leg[]): void {
  if (legs.length < 2) {
    throw new PostingError(
      `double-entry requires at least two postings, received ${legs.length}`,
    );
  }

  for (const leg of legs) {
    if (leg.amount === ZERO) {
      throw new PostingError(`posting to ${leg.accountId} is zero and carries no information`);
    }
  }

  const total = sum(legs.map((leg) => leg.amount));
  if (total !== ZERO) {
    throw new PostingError(`postings sum to ${total} paise; they must sum to 0`);
  }
}

/** Convenience for callers that want a boolean rather than an exception. */
export function isBalanced(legs: readonly Leg[]): boolean {
  try {
    assertBalanced(legs);
    return true;
  } catch {
    return false;
  }
}

/** Net effect on one account, for assertions and previews. */
export function netFor(legs: readonly Leg[], accountId: string): Paise {
  return sum(legs.filter((leg) => leg.accountId === accountId).map((leg) => leg.amount));
}

/** Every account a transaction touches, in leg order, without duplicates. */
export function accountsTouched(legs: readonly Leg[]): string[] {
  return [...new Set(legs.map((leg) => leg.accountId))];
}

/** Payload shape accepted by the post_transaction RPC. */
export function toRpcPostings(legs: readonly Leg[]): { ledger_account_id: string; amount: number; memo?: string }[] {
  return legs.map((leg) => ({
    ledger_account_id: leg.accountId,
    amount: leg.amount,
    ...(leg.memo ? { memo: leg.memo } : {}),
  }));
}

export { paise };
