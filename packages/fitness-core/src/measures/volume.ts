/**
 * Volume load — the figure most sensitive to accumulated error.
 *
 * Volume is the sum of (weight x reps) across every set, so a single training
 * block aggregates thousands of terms. Done in kilograms as floats, 2.5kg and
 * 1.25kg plate increments drift; done in whole grams it is exact.
 */

import { type Grams, type Reps, grams } from './units';

export interface PerformedSet {
  readonly weight: Grams;
  readonly reps: Reps;
}

/** Volume load of one set, in grams. */
export function setVolume(set: PerformedSet): Grams {
  return grams(set.weight * set.reps);
}

/** Total volume load across sets, in grams. Exact for any realistic set count. */
export function totalVolume(sets: readonly PerformedSet[]): Grams {
  let total = 0;
  for (const set of sets) {
    total += set.weight * set.reps;
  }
  return grams(total);
}

export function totalReps(sets: readonly PerformedSet[]): number {
  return sets.reduce((acc, set) => acc + set.reps, 0);
}

/** Heaviest weight moved for at least one rep. Null when no set has reps. */
export function topSetWeight(sets: readonly PerformedSet[]): Grams | null {
  let best: Grams | null = null;
  for (const set of sets) {
    if (set.reps > 0 && (best === null || set.weight > best)) best = set.weight;
  }
  return best;
}

/** Display volume in kg, or tonnes once it passes a tonne. */
export function formatVolume(volume: Grams): string {
  if (volume >= 1_000_000) {
    const tonnes = volume / 1_000_000;
    return `${tonnes.toFixed(2).replace(/\.?0+$/, '')}t`;
  }
  const kg = volume / 1000;
  return `${kg.toFixed(2).replace(/\.?0+$/, '')}kg`;
}
