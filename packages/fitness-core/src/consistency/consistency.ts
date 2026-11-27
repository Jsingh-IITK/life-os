/**
 * What happened on each planned day: done, partial, skipped, missed, rest.
 *
 * "Missed" is derived, never stored. A stored miss needs something to write
 * it (a scheduler or a sweep), records an event that did not happen, and is
 * wrong whenever that writer does not run. Derived, it is always current.
 *
 * Rules agreed 2026-11-27:
 *   gym      done by a completed session for the day's template
 *   striking an active day: done by any conditioning session that date, or
 *            a completed striking session; missed when nothing is logged
 *   optional never missed — doing it is a bonus
 *   recovery rest
 *
 * Dates are calendar dates already in the user's timezone. `today` is a
 * parameter, never read from a clock, so every rule is a unit test.
 */

import type { IsoDate } from '../records/sets';

export type SessionKind = 'gym' | 'striking' | 'optional' | 'recovery';
export type SessionStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

export interface PlanDay {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  readonly weekday: number;
  readonly kind: SessionKind;
  readonly templateId: string | null;
}

/**
 * A plan as it stood over a span of dates. Editing a plan creates a new
 * version, so changing Tuesday to a rest day does not turn past missed
 * Tuesdays into rest days.
 */
export interface PlanVersion {
  readonly effectiveFrom: IsoDate;
  /** Exclusive. Null while the version is current. */
  readonly effectiveTo: IsoDate | null;
  readonly days: readonly PlanDay[];
}

export interface SessionRecord {
  readonly templateId: string | null;
  readonly kind: SessionKind;
  /** The plan day it was meant for. A Tuesday workout done on Wednesday counts for Tuesday. */
  readonly scheduledFor: IsoDate | null;
  readonly performedOn: IsoDate;
  readonly status: SessionStatus;
  /** At least one non-warm-up set with reps > 0. */
  readonly hasWorkingSets: boolean;
}

export interface ConditioningRecord {
  readonly performedOn: IsoDate;
}

export type DayStatus =
  | 'unplanned' // no plan covered this date
  | 'rest'
  | 'done'
  | 'partial' // past, started, some working sets, never completed
  | 'in_progress' // today, started
  | 'skipped' // the user chose not to train
  | 'missed' // past, planned, nothing logged or skipped
  | 'upcoming' // today or later, nothing yet
  | 'optional'; // optional day with nothing logged: never a miss

export interface DayResult {
  readonly date: IsoDate;
  readonly status: DayStatus;
  readonly kind: SessionKind | null;
  readonly templateId: string | null;
}

export class ConsistencyError extends Error {
  override readonly name = 'ConsistencyError';
}

function parse(iso: IsoDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new ConsistencyError(`expected a YYYY-MM-DD date, received "${iso}"`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** ISO weekday of a calendar date. Pure calendar arithmetic; no timezone involved. */
export function isoWeekdayOf(iso: IsoDate): number {
  const { y, m, d } = parse(iso);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** The calendar date `n` days after `iso` (negative for before). */
export function addDays(iso: IsoDate, n: number): IsoDate {
  const { y, m, d } = parse(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** The Monday on or before a date. */
export function weekStart(iso: IsoDate): IsoDate {
  return addDays(iso, 1 - isoWeekdayOf(iso));
}

function planFor(versions: readonly PlanVersion[], date: IsoDate): PlanVersion | null {
  const covering = versions.filter(
    (v) => v.effectiveFrom <= date && (v.effectiveTo === null || date < v.effectiveTo),
  );
  if (covering.length > 1) {
    throw new ConsistencyError(`more than one plan version covers ${date}`);
  }
  return covering[0] ?? null;
}

export function classifyDay(
  date: IsoDate,
  today: IsoDate,
  plans: readonly PlanVersion[],
  sessions: readonly SessionRecord[],
  conditioning: readonly ConditioningRecord[],
): DayResult {
  parse(today);
  const plan = planFor(plans, date);
  const day = plan?.days.find((d) => d.weekday === isoWeekdayOf(date));
  if (!day) return { date, status: 'unplanned', kind: null, templateId: null };

  const result = (status: DayStatus): DayResult => ({
    date,
    status,
    kind: day.kind,
    templateId: day.templateId,
  });

  if (day.kind === 'recovery') return result('rest');

  const forDay = sessions.filter((s) => (s.scheduledFor ?? s.performedOn) === date);
  const conditioned = conditioning.some((c) => c.performedOn === date);
  const isPast = date < today;

  // Which sessions answer this plan day: the day's template if it has one,
  // otherwise a session of the same kind.
  const relevant = forDay.filter((s) =>
    day.templateId !== null ? s.templateId === day.templateId : s.kind === day.kind,
  );

  if (day.kind === 'optional') {
    const did = conditioned || forDay.some((s) => s.status === 'completed');
    return result(did ? 'done' : 'optional');
  }

  if (relevant.some((s) => s.status === 'completed')) return result('done');
  if (day.kind === 'striking' && conditioned) return result('done');
  if (relevant.some((s) => s.status === 'skipped')) return result('skipped');

  const started = relevant.find((s) => s.status === 'in_progress');
  if (started) {
    if (!isPast) return result('in_progress');
    return result(started.hasWorkingSets ? 'partial' : 'missed');
  }

  return result(isPast ? 'missed' : 'upcoming');
}

export interface WeekSummary {
  readonly weekStart: IsoDate;
  readonly days: readonly DayResult[];
  /** Gym and striking days the plan asked for. Rest and optional days excluded. */
  readonly planned: number;
  readonly done: number;
  readonly partial: number;
  readonly skipped: number;
  readonly missed: number;
  /** Planned days still ahead, including today if nothing is logged yet. */
  readonly remaining: number;
  /** Optional days that were trained. Not part of `planned`. */
  readonly optionalDone: number;
}

/**
 * The seven days from the Monday of `anyDay`'s week.
 *
 * Counts only. An adherence percentage is deliberately absent: how partial
 * and skipped days should weigh is decision D6, still open.
 */
export function summariseWeek(
  anyDay: IsoDate,
  today: IsoDate,
  plans: readonly PlanVersion[],
  sessions: readonly SessionRecord[],
  conditioning: readonly ConditioningRecord[],
): WeekSummary {
  const start = weekStart(anyDay);
  const days = Array.from({ length: 7 }, (_, i) =>
    classifyDay(addDays(start, i), today, plans, sessions, conditioning),
  );

  const isRequired = (d: DayResult) => d.kind === 'gym' || d.kind === 'striking';
  const count = (status: DayStatus) => days.filter((d) => isRequired(d) && d.status === status).length;

  return {
    weekStart: start,
    days,
    planned: days.filter(isRequired).length,
    done: count('done'),
    partial: count('partial'),
    skipped: count('skipped'),
    missed: count('missed'),
    remaining: count('upcoming') + count('in_progress'),
    optionalDone: days.filter((d) => d.kind === 'optional' && d.status === 'done').length,
  };
}
