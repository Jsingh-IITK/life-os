/**
 * Double progression: add reps within the prescribed range, then add load.
 *
 * Inputs are the session snapshot's prescription (target sets, rep range) and
 * the most recent sessions for one exercise. The load step is a required
 * input, never a default: the right step depends on the equipment and the
 * user, and a hardcoded assumption is exactly what CLAUDE.md rule 8 forbids
 * for money and the same reasoning holds here.
 *
 * With no history the engine suggests nothing. It never invents a starting
 * weight.
 */

import { type Grams, type Reps, grams } from '../measures/units';
import { type LoggedSet, chronological, effectiveLoad, isWorkingSet } from '../records/sets';

export interface Prescription {
  readonly targetSets: number;
  readonly repMin: Reps;
  readonly repMax: Reps;
}

export type Suggestion =
  | { readonly action: 'establish'; readonly reason: 'no_history' }
  | {
      readonly action: 'increase';
      readonly load: Grams;
      readonly targetReps: Reps;
      readonly reason: 'top_of_range_on_all_sets';
    }
  | {
      readonly action: 'hold';
      readonly load: Grams;
      readonly targetReps: Reps;
      readonly reason: 'building_reps' | 'below_range_once' | 'too_few_sets';
    }
  | {
      readonly action: 'decrease';
      readonly load: Grams;
      readonly targetReps: Reps;
      readonly reason: 'below_range_twice';
    };

export class ProgressionError extends Error {
  override readonly name = 'ProgressionError';
}

interface SessionSummary {
  readonly load: Grams;
  /** Reps of each working set done at `load`, in order. */
  readonly repsAtLoad: readonly number[];
}

/**
 * The working load of a session is its heaviest effective load; only sets at
 * that load count toward progressing it. Lighter back-off sets are allowed
 * but neither help nor hurt.
 */
function summarise(sets: readonly LoggedSet[]): SessionSummary | null {
  const working = chronological(sets.filter(isWorkingSet));
  if (working.length === 0) return null;
  let load = 0;
  for (const s of working) load = Math.max(load, effectiveLoad(s));
  const repsAtLoad = working.filter((s) => effectiveLoad(s) === load).map((s) => s.reps);
  return { load: grams(load), repsAtLoad };
}

/**
 * @param history  one exercise's sets across sessions, any order
 * @param step     load change for one progression step, grams (> 0)
 */
export function suggestNext(
  prescription: Prescription,
  history: readonly LoggedSet[],
  step: Grams,
): Suggestion {
  const { targetSets, repMin, repMax } = prescription;
  if (!Number.isInteger(targetSets) || targetSets < 1) {
    throw new ProgressionError(`targetSets must be a positive integer, received ${targetSets}`);
  }
  if (repMin < 1 || repMax < repMin) {
    throw new ProgressionError(`invalid rep range ${repMin}–${repMax}`);
  }
  if (step <= 0) throw new ProgressionError('step must be greater than zero');

  // Group by session, newest last.
  const bySession = new Map<string, LoggedSet[]>();
  for (const set of chronological(history)) {
    const list = bySession.get(set.sessionId);
    if (list) list.push(set);
    else bySession.set(set.sessionId, [set]);
  }
  const sessions = [...bySession.values()]
    .map(summarise)
    .filter((s): s is SessionSummary => s !== null);

  const last = sessions[sessions.length - 1];
  if (!last) return { action: 'establish', reason: 'no_history' };

  const counted = last.repsAtLoad.slice(0, targetSets);
  const belowRange = counted.some((r) => r < repMin);

  if (belowRange) {
    const previous = sessions[sessions.length - 2];
    const missedTwice =
      previous !== undefined &&
      previous.load === last.load &&
      previous.repsAtLoad.slice(0, targetSets).some((r) => r < repMin);
    if (missedTwice) {
      return {
        action: 'decrease',
        load: grams(Math.max(last.load - step, 0)),
        targetReps: repMin,
        reason: 'below_range_twice',
      };
    }
    return { action: 'hold', load: last.load, targetReps: repMin, reason: 'below_range_once' };
  }

  if (counted.length < targetSets) {
    return { action: 'hold', load: last.load, targetReps: repMin, reason: 'too_few_sets' };
  }

  if (counted.every((r) => r >= repMax)) {
    return {
      action: 'increase',
      load: grams(last.load + step),
      targetReps: repMin,
      reason: 'top_of_range_on_all_sets',
    };
  }

  // Within range but not at the top on every set: aim one rep above the
  // weakest set, capped at the top of the range.
  const weakest = Math.min(...counted);
  return {
    action: 'hold',
    load: last.load,
    targetReps: Math.min(weakest + 1, repMax) as Reps,
    reason: 'building_reps',
  };
}
