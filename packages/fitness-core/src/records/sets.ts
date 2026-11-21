/**
 * A logged set as the engines see it, and the two rules every analytic shares.
 *
 * These mirror the database views exactly (`set_volume`, `exercise_history`
 * in migration 0014), so a figure computed here and one read from SQL can
 * never disagree.
 */

import { type Grams, type Reps, grams } from '../measures/units';

/** A calendar date, YYYY-MM-DD, in the user's timezone. Never a timestamp. */
export type IsoDate = string;

export interface LoggedSet {
  readonly sessionId: string;
  readonly performedOn: IsoDate;
  /** Position within its exercise in the session; breaks ties deterministically. */
  readonly setIndex: number;
  readonly weight: Grams;
  /** Band or machine assistance. Reduces what was actually lifted. */
  readonly assistance: Grams;
  readonly reps: Reps;
  /** Reps in reserve; null when not recorded (absent is not zero). */
  readonly rir: number | null;
  readonly isWarmup: boolean;
}

/**
 * What was actually lifted: weight minus assistance, never below zero.
 * Same as `effective_grams` in the `set_volume` view.
 */
export function effectiveLoad(set: Pick<LoggedSet, 'weight' | 'assistance'>): Grams {
  return grams(Math.max(set.weight - set.assistance, 0));
}

/**
 * Warm-ups are logged but never count, and a set with zero reps was not
 * performed. Same filter as the `set_volume` view.
 */
export function isWorkingSet(set: Pick<LoggedSet, 'isWarmup' | 'reps'>): boolean {
  return !set.isWarmup && set.reps > 0;
}

/**
 * Estimated one-rep max, Epley: load × (1 + reps / 30).
 *
 * Computed in integers: load × (30 + reps) is exact, then divided by 30 and
 * rounded half away from zero, as the view's numeric → bigint cast does. The
 * view computes reps/30 as a 20-digit decimal first, so where the exact result
 * is a half-gram it can round down instead; the two then differ by 1g. No
 * realistic plate load hits that case. An estimate: always label it as one.
 */
export function estimatedOneRepMax(load: Grams, reps: Reps): Grams {
  if (reps <= 0) return grams(0);
  const numerator = load * (30 + reps);
  return grams(Math.floor((2 * numerator + 30) / 60));
}

/** Stable chronological order: date, then session, then set position. */
export function chronological<T extends Pick<LoggedSet, 'performedOn' | 'sessionId' | 'setIndex'>>(
  sets: readonly T[],
): T[] {
  return [...sets].sort(
    (a, b) =>
      a.performedOn.localeCompare(b.performedOn) ||
      a.sessionId.localeCompare(b.sessionId) ||
      a.setIndex - b.setIndex,
  );
}
