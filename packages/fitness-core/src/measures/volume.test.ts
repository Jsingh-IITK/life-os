import { describe, expect, it } from 'vitest';

import { formatVolume, setVolume, topSetWeight, totalReps, totalVolume } from './volume';
import { fromKilograms, grams, reps } from './units';

const set = (kg: string, count: number) => ({
  weight: fromKilograms(kg),
  reps: reps(count),
});

describe('volume load', () => {
  it('computes a single set', () => {
    // 60kg x 8 = 480kg
    expect(setVolume(set('60', 8))).toBe(fromKilograms('480'));
  });

  it('sums a session exactly', () => {
    const sets = [set('60', 8), set('62.5', 8), set('65', 6)];
    // 480 + 500 + 390 = 1370kg
    expect(totalVolume(sets)).toBe(fromKilograms('1370'));
  });

  it('is exact over a volume of sets that would drift in floats', () => {
    // 1000 sets of 1.25kg x 3 = 3750kg
    const sets = Array.from({ length: 1000 }, () => set('1.25', 3));
    expect(totalVolume(sets)).toBe(fromKilograms('3750'));

    const floatTotal = Array.from({ length: 1000 }, () => 1.25 * 3).reduce((a, b) => a + b, 0);
    expect(totalVolume(sets) / 1000).toBeCloseTo(floatTotal, 6);
    // The integer result is exact; the float one is merely close.
    expect(totalVolume(sets)).toBe(3_750_000);
  });

  it('treats an empty session as zero, not an error', () => {
    expect(totalVolume([])).toBe(0);
    expect(totalReps([])).toBe(0);
  });

  it('counts reps', () => {
    expect(totalReps([set('60', 8), set('60', 8), set('60', 6)])).toBe(22);
  });

  it('bodyweight sets contribute no load but do contribute reps', () => {
    const sets = [{ weight: grams(0), reps: reps(15) }];
    expect(totalVolume(sets)).toBe(0);
    expect(totalReps(sets)).toBe(15);
  });
});

describe('topSetWeight()', () => {
  it('finds the heaviest weight actually lifted', () => {
    expect(topSetWeight([set('60', 8), set('80', 1), set('70', 5)])).toBe(fromKilograms('80'));
  });

  it('ignores sets with zero reps — a logged-but-unperformed set is not a lift', () => {
    expect(topSetWeight([set('60', 8), set('100', 0)])).toBe(fromKilograms('60'));
  });

  it('returns null when nothing was performed', () => {
    expect(topSetWeight([])).toBeNull();
    expect(topSetWeight([set('100', 0)])).toBeNull();
  });
});

describe('formatVolume()', () => {
  it('shows kilograms, then tonnes', () => {
    expect(formatVolume(fromKilograms('480'))).toBe('480kg');
    expect(formatVolume(fromKilograms('999'))).toBe('999kg');
    expect(formatVolume(fromKilograms('1370'))).toBe('1.37t');
    expect(formatVolume(fromKilograms('1000'))).toBe('1t');
    expect(formatVolume(fromKilograms('1500'))).toBe('1.5t');
  });
});
