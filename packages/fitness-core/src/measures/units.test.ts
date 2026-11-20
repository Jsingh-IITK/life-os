import { describe, expect, it } from 'vitest';

import {
  MeasureError,
  formatDistance,
  formatDuration,
  formatPace,
  formatWeight,
  fromKilograms,
  fromKilometres,
  fromMinutes,
  grams,
  metres,
  paceSecondsPerKm,
  reps,
  seconds,
  toKilograms,
} from './units';

describe('integer discipline', () => {
  it('rejects fractional grams rather than rounding silently', () => {
    expect(() => grams(1.5)).toThrow(MeasureError);
    expect(() => grams(1.5)).toThrow(/whole grams/);
  });

  it('rejects negative measures', () => {
    expect(() => grams(-1)).toThrow(/cannot be negative/);
    expect(() => seconds(-1)).toThrow(/cannot be negative/);
    expect(() => metres(-1)).toThrow(/cannot be negative/);
    expect(() => reps(-1)).toThrow(/cannot be negative/);
  });

  it('rejects non-finite measures', () => {
    expect(() => grams(Number.NaN)).toThrow(MeasureError);
    expect(() => seconds(Number.POSITIVE_INFINITY)).toThrow(MeasureError);
  });

  it('allows zero — bodyweight sets and rest days are real', () => {
    expect(grams(0)).toBe(0);
    expect(reps(0)).toBe(0);
  });
});

describe('weight', () => {
  it('parses kilograms exactly, including micro-plates', () => {
    expect(fromKilograms('60')).toBe(60_000);
    expect(fromKilograms('62.5')).toBe(62_500);
    expect(fromKilograms('1.25')).toBe(1_250);
    expect(fromKilograms('0.5')).toBe(500);
    expect(fromKilograms(100)).toBe(100_000);
  });

  it('rejects precision finer than a gram', () => {
    expect(() => fromKilograms('60.0001')).toThrow(/at most 3 decimal places/);
  });

  it('rejects junk', () => {
    expect(() => fromKilograms('heavy')).toThrow(MeasureError);
    expect(() => fromKilograms('')).toThrow(MeasureError);
  });

  it('round-trips and strips trailing zeros', () => {
    expect(toKilograms(grams(60_000))).toBe('60');
    expect(toKilograms(grams(62_500))).toBe('62.5');
    expect(toKilograms(grams(1_250))).toBe('1.25');
  });

  it('formats for display, naming bodyweight explicitly', () => {
    expect(formatWeight(fromKilograms('60'))).toBe('60kg');
    expect(formatWeight(fromKilograms('62.5'))).toBe('62.5kg');
    expect(formatWeight(grams(0))).toBe('bodyweight');
  });

  it('adding plate increments does not drift', () => {
    // 2.5 + 1.25 + 1.25 kg, twenty times over.
    const increments = Array.from({ length: 20 }, () => [
      fromKilograms('2.5'),
      fromKilograms('1.25'),
      fromKilograms('1.25'),
    ]).flat();
    const total = increments.reduce((a, b) => a + b, 0);
    expect(total).toBe(fromKilograms('100'));

    // The float equivalent in kg does not land exactly.
    const floatTotal = Array.from({ length: 20 }, () => [2.5, 1.25, 1.25])
      .flat()
      .reduce((a, b) => a + b, 0);
    expect(Number.isInteger(floatTotal)).toBe(true); // this one happens to be clean
    // ...but a 0.1kg increment is not:
    const drifting = Array.from({ length: 10 }, () => 0.1).reduce((a, b) => a + b, 0);
    expect(drifting).not.toBe(1);
  });
});

describe('duration', () => {
  it('converts minutes', () => {
    expect(fromMinutes(45)).toBe(2_700);
    expect(fromMinutes(1.5)).toBe(90);
  });

  it('formats across the ranges a session actually spans', () => {
    expect(formatDuration(seconds(45))).toBe('45s');
    expect(formatDuration(seconds(60))).toBe('1m');
    expect(formatDuration(seconds(750))).toBe('12m 30s');
    expect(formatDuration(seconds(2_700))).toBe('45m');
    expect(formatDuration(seconds(3_900))).toBe('1h 05m');
  });
});

describe('distance and pace', () => {
  it('converts and formats', () => {
    expect(fromKilometres(5)).toBe(5_000);
    expect(formatDistance(metres(400))).toBe('400m');
    expect(formatDistance(metres(5_000))).toBe('5km');
    expect(formatDistance(metres(5_500))).toBe('5.5km');
  });

  it('computes pace per kilometre', () => {
    // 5km in 27:30 = 1650s -> 330 s/km = 5:30 /km
    expect(paceSecondsPerKm(metres(5_000), seconds(1_650))).toBe(330);
    expect(formatPace(330)).toBe('5:30 /km');
  });

  it('returns null rather than Infinity for zero distance', () => {
    // Forces callers to handle "no pace" instead of rendering nonsense.
    expect(paceSecondsPerKm(metres(0), seconds(600))).toBeNull();
  });
});
