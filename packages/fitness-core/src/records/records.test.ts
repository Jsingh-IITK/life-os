import { describe, expect, it } from 'vitest';

import { fromKilograms, grams, reps } from '../measures/units';
import { newRecords, personalRecords } from './records';
import { type LoggedSet, effectiveLoad, estimatedOneRepMax, isWorkingSet } from './sets';

let counter = 0;
function set(
  sessionId: string,
  performedOn: string,
  kg: string,
  count: number,
  extra: Partial<LoggedSet> = {},
): LoggedSet {
  counter += 1;
  return {
    sessionId,
    performedOn,
    setIndex: counter,
    weight: fromKilograms(kg),
    assistance: grams(0),
    reps: reps(count),
    rir: null,
    isWarmup: false,
    ...extra,
  };
}

describe('set rules (mirror the set_volume view)', () => {
  it('effective load subtracts assistance and never goes negative', () => {
    expect(effectiveLoad({ weight: fromKilograms('80'), assistance: fromKilograms('30') })).toBe(
      fromKilograms('50'),
    );
    expect(effectiveLoad({ weight: fromKilograms('0'), assistance: fromKilograms('20') })).toBe(0);
  });

  it('warm-ups and zero-rep sets are not working sets', () => {
    expect(isWorkingSet({ isWarmup: true, reps: reps(10) })).toBe(false);
    expect(isWorkingSet({ isWarmup: false, reps: reps(0) })).toBe(false);
    expect(isWorkingSet({ isWarmup: false, reps: reps(1) })).toBe(true);
  });
});

describe('estimated one-rep max (Epley)', () => {
  it('matches the formula exactly in whole grams', () => {
    // 100kg × (1 + 10/30) = 133,333.33g → 133,333g
    expect(estimatedOneRepMax(fromKilograms('100'), reps(10))).toBe(133_333);
    // 60kg × 8 → 60,000 × 38 / 30 = 76,000 exactly
    expect(estimatedOneRepMax(fromKilograms('60'), reps(8))).toBe(76_000);
  });

  it('rounds half away from zero', () => {
    // 1g × 45/30 = 1.5g → 2g
    expect(estimatedOneRepMax(grams(1), reps(15))).toBe(2);
  });

  it('is zero for zero reps', () => {
    expect(estimatedOneRepMax(fromKilograms('100'), reps(0))).toBe(0);
  });

  it('never produces a fraction', () => {
    for (let r = 1; r <= 30; r++) {
      expect(Number.isInteger(estimatedOneRepMax(fromKilograms('62.5'), reps(r)))).toBe(true);
    }
  });
});

describe('personal records', () => {
  it('is empty with no working sets', () => {
    const records = personalRecords([set('a', '2026-11-01', '60', 8, { isWarmup: true })]);
    expect(records.heaviest).toBeNull();
    expect(records.bestEstimatedOneRepMax).toBeNull();
    expect(records.bestSessionVolume).toBeNull();
    expect(records.repsAtLoad.size).toBe(0);
  });

  it('ignores warm-ups even when they are heavier', () => {
    const records = personalRecords([
      set('a', '2026-11-01', '100', 1, { isWarmup: true }),
      set('a', '2026-11-01', '80', 5),
    ]);
    expect(records.heaviest?.load).toBe(fromKilograms('80'));
  });

  it('uses effective load, so assistance does not count as lifting', () => {
    const records = personalRecords([
      set('a', '2026-11-01', '70', 8, { assistance: fromKilograms('30') }),
    ]);
    expect(records.heaviest?.load).toBe(fromKilograms('40'));
  });

  it('credits the first time a best was reached, not a later tie', () => {
    const records = personalRecords([
      set('b', '2026-11-08', '100', 5),
      set('a', '2026-11-01', '100', 5),
    ]);
    expect(records.heaviest?.performedOn).toBe('2026-11-01');
    expect(records.repsAtLoad.get(fromKilograms('100'))?.performedOn).toBe('2026-11-01');
  });

  it('heaviest and best estimate can come from different sets', () => {
    const records = personalRecords([
      set('a', '2026-11-01', '100', 1), // e1RM 103.333kg
      set('a', '2026-11-01', '90', 8), // e1RM 114kg
    ]);
    expect(records.heaviest?.load).toBe(fromKilograms('100'));
    expect(records.bestEstimatedOneRepMax?.load).toBe(fromKilograms('90'));
    expect(records.bestEstimatedOneRepMax?.estimate).toBe(fromKilograms('114'));
    expect(records.bestEstimatedOneRepMax?.formula).toBe('epley');
  });

  it('session volume sums a session exactly in grams', () => {
    const records = personalRecords([
      set('a', '2026-11-01', '62.5', 8), // 500kg
      set('a', '2026-11-01', '62.5', 8), // 500kg
      set('b', '2026-11-08', '65', 6), // 390kg
    ]);
    expect(records.bestSessionVolume).toEqual({
      volume: fromKilograms('1000'),
      sessionId: 'a',
      performedOn: '2026-11-01',
    });
  });

  it('keeps the most reps at each exact load', () => {
    const records = personalRecords([
      set('a', '2026-11-01', '60', 8),
      set('b', '2026-11-08', '60', 10),
      set('b', '2026-11-08', '62.5', 6),
    ]);
    expect(records.repsAtLoad.get(fromKilograms('60'))?.reps).toBe(10);
    expect(records.repsAtLoad.get(fromKilograms('62.5'))?.reps).toBe(6);
  });

  it('does not depend on input order', () => {
    const sets = [
      set('a', '2026-11-01', '60', 8),
      set('b', '2026-11-08', '62.5', 8),
      set('c', '2026-11-15', '62.5', 9),
    ];
    const forward = personalRecords(sets);
    const reversed = personalRecords([...sets].reverse());
    expect(reversed.heaviest).toEqual(forward.heaviest);
    expect(reversed.bestEstimatedOneRepMax).toEqual(forward.bestEstimatedOneRepMax);
    expect(reversed.bestSessionVolume).toEqual(forward.bestSessionVolume);
  });
});

describe('new records in a session', () => {
  const before = [set('a', '2026-11-01', '60', 8), set('a', '2026-11-01', '60', 8)];

  it('the first session is a baseline, not a list of PRs', () => {
    expect(newRecords([], [set('a', '2026-11-01', '60', 8)])).toEqual([]);
  });

  it('a heavier lift is a heaviest record with the previous best', () => {
    const found = newRecords(before, [set('b', '2026-11-08', '62.5', 8)]);
    const heaviest = found.find((r) => r.kind === 'heaviest');
    expect(heaviest?.previous).toBe(fromKilograms('60'));
  });

  it('more reps at a known load is a rep record', () => {
    const found = newRecords(before, [set('b', '2026-11-08', '60', 9)]);
    expect(found.map((r) => r.kind)).toContain('reps_at_load');
    expect(found.map((r) => r.kind)).not.toContain('heaviest');
  });

  it('a new lighter load is not a rep record', () => {
    const found = newRecords(before, [set('b', '2026-11-08', '50', 15)]);
    expect(found.map((r) => r.kind)).not.toContain('reps_at_load');
  });

  it('matching a previous best is not a record', () => {
    expect(newRecords(before, [set('b', '2026-11-08', '60', 8)])).toEqual([]);
  });

  it('warm-ups never set records', () => {
    expect(newRecords(before, [set('b', '2026-11-08', '100', 5, { isWarmup: true })])).toEqual([]);
  });
});
