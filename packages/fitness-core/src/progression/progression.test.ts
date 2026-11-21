import { describe, expect, it } from 'vitest';

import { fromKilograms, grams, reps } from '../measures/units';
import type { LoggedSet } from '../records/sets';
import { ProgressionError, suggestNext } from './progression';

const PRESCRIPTION = { targetSets: 3, repMin: reps(8), repMax: reps(12) };
const STEP = fromKilograms('2.5');

let counter = 0;
function session(id: string, date: string, kg: string, repsPerSet: number[], extra: Partial<LoggedSet> = {}): LoggedSet[] {
  return repsPerSet.map((r) => {
    counter += 1;
    return {
      sessionId: id,
      performedOn: date,
      setIndex: counter,
      weight: fromKilograms(kg),
      assistance: grams(0),
      reps: reps(r),
      rir: null,
      isWarmup: false,
      ...extra,
    };
  });
}

describe('double progression', () => {
  it('suggests nothing without history: it never invents a weight', () => {
    expect(suggestNext(PRESCRIPTION, [], STEP)).toEqual({ action: 'establish', reason: 'no_history' });
  });

  it('warm-ups alone are not history', () => {
    const history = session('a', '2026-11-01', '40', [10, 10], { isWarmup: true });
    expect(suggestNext(PRESCRIPTION, history, STEP).action).toBe('establish');
  });

  it('adds load once every target set reaches the top of the range', () => {
    const s = suggestNext(PRESCRIPTION, session('a', '2026-11-01', '60', [12, 12, 12]), STEP);
    expect(s).toEqual({
      action: 'increase',
      load: fromKilograms('62.5'),
      targetReps: 8,
      reason: 'top_of_range_on_all_sets',
    });
  });

  it('holds and builds reps while inside the range', () => {
    const s = suggestNext(PRESCRIPTION, session('a', '2026-11-01', '60', [12, 10, 9]), STEP);
    expect(s).toEqual({ action: 'hold', load: fromKilograms('60'), targetReps: 10, reason: 'building_reps' });
  });

  it('caps the rep target at the top of the range', () => {
    const s = suggestNext(PRESCRIPTION, session('a', '2026-11-01', '60', [12, 12, 12, 11]), STEP);
    // Only the first three (target) sets count, all at 12.
    expect(s.action).toBe('increase');
  });

  it('does not increase on fewer sets than prescribed', () => {
    const s = suggestNext(PRESCRIPTION, session('a', '2026-11-01', '60', [12, 12]), STEP);
    expect(s).toMatchObject({ action: 'hold', reason: 'too_few_sets' });
  });

  it('holds after one session below the range', () => {
    const s = suggestNext(PRESCRIPTION, session('a', '2026-11-01', '65', [8, 7, 6]), STEP);
    expect(s).toEqual({ action: 'hold', load: fromKilograms('65'), targetReps: 8, reason: 'below_range_once' });
  });

  it('decreases after two sessions below the range at the same load', () => {
    const history = [
      ...session('a', '2026-11-01', '65', [8, 7, 6]),
      ...session('b', '2026-11-08', '65', [8, 7, 7]),
    ];
    expect(suggestNext(PRESCRIPTION, history, STEP)).toEqual({
      action: 'decrease',
      load: fromKilograms('62.5'),
      targetReps: 8,
      reason: 'below_range_twice',
    });
  });

  it('a miss at a different load does not count toward decreasing', () => {
    const history = [
      ...session('a', '2026-11-01', '62.5', [8, 7, 6]),
      ...session('b', '2026-11-08', '65', [8, 7, 7]),
    ];
    expect(suggestNext(PRESCRIPTION, history, STEP).action).toBe('hold');
  });

  it('judges only the latest session, whatever the input order', () => {
    const history = [
      ...session('b', '2026-11-08', '60', [12, 12, 12]),
      ...session('a', '2026-11-01', '60', [8, 8, 8]),
    ];
    expect(suggestNext(PRESCRIPTION, history, STEP).action).toBe('increase');
  });

  it('progresses the heaviest load; lighter back-off sets neither help nor hurt', () => {
    const history = [
      ...session('a', '2026-11-01', '60', [12, 12, 12]),
      ...session('a', '2026-11-01', '50', [6]),
    ];
    expect(suggestNext(PRESCRIPTION, history, STEP)).toMatchObject({
      action: 'increase',
      load: fromKilograms('62.5'),
    });
  });

  it('uses effective load for assisted work', () => {
    const history = session('a', '2026-11-01', '70', [12, 12, 12], { assistance: fromKilograms('30') });
    expect(suggestNext(PRESCRIPTION, history, STEP)).toMatchObject({ load: fromKilograms('42.5') });
  });

  it('never suggests a negative load', () => {
    const history = [
      ...session('a', '2026-11-01', '0', [5, 5, 5]),
      ...session('b', '2026-11-08', '0', [5, 5, 5]),
    ];
    expect(suggestNext(PRESCRIPTION, history, STEP)).toMatchObject({ action: 'decrease', load: 0 });
  });

  it('rejects invalid input instead of guessing', () => {
    expect(() => suggestNext({ ...PRESCRIPTION, targetSets: 0 }, [], STEP)).toThrow(ProgressionError);
    expect(() => suggestNext({ targetSets: 3, repMin: reps(12), repMax: reps(8) }, [], STEP)).toThrow(
      ProgressionError,
    );
    expect(() => suggestNext(PRESCRIPTION, [], grams(0))).toThrow(ProgressionError);
  });

  it('suggestions stay whole grams with fractional plates', () => {
    const s = suggestNext(PRESCRIPTION, session('a', '2026-11-01', '22.5', [12, 12, 12]), fromKilograms('1.25'));
    expect(s).toMatchObject({ load: fromKilograms('23.75') });
  });
});
