import {
  ZERO,
  atLeastZero,
  isZero,
  subtract,
  sum,
  type Paise,
} from '../money/paise';

/** One category's plan and what was actually spent against it. */
export interface AllocationInput {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly planned: Paise;
  readonly actual: Paise;
  readonly rollover?: boolean;
  /** Unspent remainder carried in from the previous month, if any. */
  readonly carriedIn?: Paise;
}

export type BudgetHealth = 'unspent' | 'on-track' | 'close' | 'over';

export interface AllocationStatus {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly planned: Paise;
  /** Planned plus anything carried in — what is actually available. */
  readonly available: Paise;
  readonly actual: Paise;
  /** Never negative: overspend is reported separately, not as a negative remainder. */
  readonly remaining: Paise;
  /** Amount spent beyond what was available. Zero unless over. */
  readonly overspend: Paise;
  /** 0–1 for display. Capped, so a progress bar cannot exceed its track. */
  readonly utilisation: number;
  /** Uncapped, for reporting an actual overspend honestly. */
  readonly rawUtilisation: number;
  readonly health: BudgetHealth;
}

/**
 * Status for one allocation.
 *
 * Two deliberate choices:
 *
 *  - `remaining` is clamped at zero and overspend is a separate field. A
 *    negative remaining reads as "you have minus two hundred rupees left",
 *    which is not what a person wants to be told; "you are ₹200 over" is.
 *  - `utilisation` is capped at 1 for bars and `rawUtilisation` is not, so a
 *    150% overspend can be stated as 150% without the bar overflowing.
 */
export function allocationStatus(input: AllocationInput): AllocationStatus {
  const carriedIn = input.carriedIn ?? ZERO;
  const available = sum([input.planned, carriedIn]);

  const difference = subtract(available, input.actual);
  const remaining = atLeastZero(difference);
  const overspend = difference < 0 ? (-difference as Paise) : ZERO;

  // An unfunded category that has been spent against is fully over, not
  // divided by zero.
  const rawUtilisation = isZero(available)
    ? isZero(input.actual)
      ? 0
      : 1
    : input.actual / available;

  return {
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    planned: input.planned,
    available,
    actual: input.actual,
    remaining,
    overspend,
    utilisation: Math.max(0, Math.min(1, rawUtilisation)),
    rawUtilisation,
    health: healthFor(available, input.actual, rawUtilisation),
  };
}

function healthFor(available: Paise, actual: Paise, utilisation: number): BudgetHealth {
  if (isZero(actual)) return 'unspent';
  // Spending against an unfunded category is over by any reading, and its
  // utilisation is capped at 1 to avoid dividing by zero — so it has to be
  // caught here rather than by the ratio.
  if (isZero(available)) return 'over';
  if (utilisation > 1) return 'over';
  // "Close" exists so the warning arrives before the limit, not at it.
  if (utilisation >= 0.85) return 'close';
  return 'on-track';
}

export interface BudgetSummary {
  readonly allocations: readonly AllocationStatus[];
  readonly totalPlanned: Paise;
  readonly totalActual: Paise;
  readonly totalRemaining: Paise;
  readonly totalOverspend: Paise;
  readonly utilisation: number;
  /** Categories that have exceeded their allocation. */
  readonly overCategories: readonly AllocationStatus[];
}

/**
 * Roll a month's allocations into one view.
 *
 * Totals are summed from the per-category figures rather than recomputed, so
 * the header and the rows can never disagree — a mismatch there is the kind
 * of thing that destroys trust in every other number on the page.
 */
export function budgetSummary(inputs: readonly AllocationInput[]): BudgetSummary {
  const allocations = inputs.map(allocationStatus);

  const totalPlanned = sum(allocations.map((a) => a.available));
  const totalActual = sum(allocations.map((a) => a.actual));
  const totalRemaining = sum(allocations.map((a) => a.remaining));
  const totalOverspend = sum(allocations.map((a) => a.overspend));

  const utilisation = isZero(totalPlanned)
    ? isZero(totalActual)
      ? 0
      : 1
    : totalActual / totalPlanned;

  return {
    allocations,
    totalPlanned,
    totalActual,
    totalRemaining,
    totalOverspend,
    utilisation,
    overCategories: allocations.filter((a) => a.health === 'over'),
  };
}

/**
 * What carries into next month for a rollover category.
 *
 * Only an unspent remainder rolls. An overspend does not become next month's
 * debt: the PRD treats rollover as a carried allowance, and silently reducing
 * next month's budget because of last month's overspend would surprise the
 * user with a number they never set.
 */
export function carryForward(status: AllocationStatus, rollover: boolean): Paise {
  if (!rollover) return ZERO;
  return status.remaining;
}
