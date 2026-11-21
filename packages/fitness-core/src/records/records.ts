/**
 * Personal records, derived from logged sets — never stored as fact.
 *
 * A record is the first time a best was reached. A later equal performance
 * does not take it over, so the date shown is when it was actually earned.
 * Input is one exercise's history; callers group by exercise.
 */

import { type Grams, type Reps, grams, reps as toReps } from '../measures/units';
import {
  type IsoDate,
  type LoggedSet,
  chronological,
  effectiveLoad,
  estimatedOneRepMax,
  isWorkingSet,
} from './sets';

export interface RecordSet {
  readonly load: Grams;
  readonly reps: Reps;
  readonly sessionId: string;
  readonly performedOn: IsoDate;
}

export interface VolumeRecord {
  readonly volume: Grams;
  readonly sessionId: string;
  readonly performedOn: IsoDate;
}

export interface EstimatedRecord extends RecordSet {
  /** The estimate itself. Labelled with its formula wherever it is shown. */
  readonly estimate: Grams;
  readonly formula: 'epley';
}

export interface PersonalRecords {
  /** Heaviest effective load lifted for at least one rep. */
  readonly heaviest: RecordSet | null;
  /** Best Epley estimate across all working sets. */
  readonly bestEstimatedOneRepMax: EstimatedRecord | null;
  /** Largest single-session working volume (Σ load × reps). */
  readonly bestSessionVolume: VolumeRecord | null;
  /** Most reps ever done at each exact load, keyed by grams. */
  readonly repsAtLoad: ReadonlyMap<Grams, RecordSet>;
}

const EMPTY: PersonalRecords = {
  heaviest: null,
  bestEstimatedOneRepMax: null,
  bestSessionVolume: null,
  repsAtLoad: new Map(),
};

export function personalRecords(history: readonly LoggedSet[]): PersonalRecords {
  const working = chronological(history.filter(isWorkingSet));
  if (working.length === 0) return EMPTY;

  let heaviest: RecordSet | null = null;
  let bestE1rm: EstimatedRecord | null = null;
  const repsAtLoad = new Map<Grams, RecordSet>();

  // Session volumes, in first-seen (chronological) order.
  const sessionVolume = new Map<string, { volume: number; performedOn: IsoDate }>();

  for (const set of working) {
    const load = effectiveLoad(set);
    const entry: RecordSet = {
      load,
      reps: set.reps,
      sessionId: set.sessionId,
      performedOn: set.performedOn,
    };

    // Strictly greater: the earliest equal performance keeps the record.
    if (heaviest === null || load > heaviest.load) heaviest = entry;

    const estimate = estimatedOneRepMax(load, set.reps);
    if (bestE1rm === null || estimate > bestE1rm.estimate) {
      bestE1rm = { ...entry, estimate, formula: 'epley' };
    }

    const atLoad = repsAtLoad.get(load);
    if (atLoad === undefined || set.reps > atLoad.reps) repsAtLoad.set(load, entry);

    const s = sessionVolume.get(set.sessionId);
    if (s) s.volume += load * set.reps;
    else sessionVolume.set(set.sessionId, { volume: load * set.reps, performedOn: set.performedOn });
  }

  let bestSessionVolume: VolumeRecord | null = null;
  for (const [sessionId, s] of sessionVolume) {
    if (bestSessionVolume === null || s.volume > bestSessionVolume.volume) {
      bestSessionVolume = { volume: grams(s.volume), sessionId, performedOn: s.performedOn };
    }
  }

  return { heaviest, bestEstimatedOneRepMax: bestE1rm, bestSessionVolume, repsAtLoad };
}

export type NewRecord =
  | { readonly kind: 'heaviest'; readonly previous: Grams; readonly current: RecordSet }
  | {
      readonly kind: 'estimated_one_rep_max';
      readonly previous: Grams;
      readonly current: EstimatedRecord;
    }
  | { readonly kind: 'session_volume'; readonly previous: Grams; readonly current: VolumeRecord }
  | { readonly kind: 'reps_at_load'; readonly previous: Reps; readonly current: RecordSet };

/**
 * Records a session beat, compared with everything before it.
 *
 * With no earlier working sets there is nothing to beat: the first session
 * sets a baseline and returns no records, rather than calling every lift a PR.
 * Rep records count only at a load done before; a new load is covered by
 * `heaviest` if it is one.
 */
export function newRecords(
  before: readonly LoggedSet[],
  session: readonly LoggedSet[],
): NewRecord[] {
  const prior = personalRecords(before);
  if (prior.heaviest === null) return [];

  const now = personalRecords(session);
  const found: NewRecord[] = [];

  if (now.heaviest && now.heaviest.load > prior.heaviest.load) {
    found.push({ kind: 'heaviest', previous: prior.heaviest.load, current: now.heaviest });
  }

  const prevE1rm = prior.bestEstimatedOneRepMax!.estimate;
  if (now.bestEstimatedOneRepMax && now.bestEstimatedOneRepMax.estimate > prevE1rm) {
    found.push({
      kind: 'estimated_one_rep_max',
      previous: prevE1rm,
      current: now.bestEstimatedOneRepMax,
    });
  }

  const prevVolume = prior.bestSessionVolume!.volume;
  if (now.bestSessionVolume && now.bestSessionVolume.volume > prevVolume) {
    found.push({ kind: 'session_volume', previous: prevVolume, current: now.bestSessionVolume });
  }

  const loads = [...now.repsAtLoad.keys()].sort((a, b) => a - b);
  for (const load of loads) {
    const before = prior.repsAtLoad.get(load);
    const current = now.repsAtLoad.get(load)!;
    if (before && current.reps > before.reps) {
      found.push({ kind: 'reps_at_load', previous: toReps(before.reps), current });
    }
  }

  return found;
}
