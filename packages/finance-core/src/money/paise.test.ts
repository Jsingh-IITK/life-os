import { describe, expect, it } from 'vitest';

import {
  MAX_PAISE,
  MoneyError,
  ZERO,
  abs,
  add,
  allocate,
  atLeastZero,
  compare,
  fromDatabase,
  fromRupees,
  isPaise,
  multiplyByInt,
  negate,
  paise,
  scale,
  split,
  subtract,
  sum,
  toDatabase,
  toRupees,
} from './paise';

describe('the reason this module exists', () => {
  it('floating-point rupees lose money; integer paise do not', () => {
    // The canonical failure, in rupees.
    expect(0.1 + 0.2).not.toBe(0.3);

    // Same arithmetic in paise is exact.
    expect(add(paise(10), paise(20))).toBe(paise(30));
  });

  it('summing a third of a rupee three times stays exact', () => {
    // 33.33 + 33.33 + 33.34 = 100.00, with no residue.
    const parts = [fromRupees('33.33'), fromRupees('33.33'), fromRupees('33.34')];
    expect(sum(parts)).toBe(fromRupees('100.00'));
  });

  it('accumulating a thousand small expenses does not drift', () => {
    const expenses = Array.from({ length: 1000 }, () => fromRupees('0.07'));
    expect(sum(expenses)).toBe(fromRupees('70.00'));

    // The float equivalent does drift.
    const floatTotal = Array.from({ length: 1000 }, () => 0.07).reduce((a, b) => a + b, 0);
    expect(floatTotal).not.toBe(70);
  });
});

describe('paise()', () => {
  it('accepts whole paise including zero and negatives', () => {
    expect(paise(0)).toBe(0);
    expect(paise(125075)).toBe(125075);
    expect(paise(-5000)).toBe(-5000);
  });

  it('rejects fractional paise rather than rounding silently', () => {
    expect(() => paise(10.5)).toThrow(MoneyError);
    expect(() => paise(10.5)).toThrow(/whole paise/);
  });

  it('rejects non-finite values', () => {
    expect(() => paise(Number.NaN)).toThrow(MoneyError);
    expect(() => paise(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it('rejects amounts beyond the safe integer range', () => {
    expect(() => paise(MAX_PAISE + 2)).toThrow(/safe integer range/);
  });
});

describe('isPaise()', () => {
  it('discriminates without throwing', () => {
    expect(isPaise(100)).toBe(true);
    expect(isPaise(1.5)).toBe(false);
    expect(isPaise('100')).toBe(false);
    expect(isPaise(null)).toBe(false);
    expect(isPaise(Number.NaN)).toBe(false);
  });
});

describe('rupee conversion', () => {
  it('converts exact decimal strings', () => {
    expect(fromRupees('1250.75')).toBe(125075);
    expect(fromRupees('0.01')).toBe(1);
    expect(fromRupees('100')).toBe(10000);
    expect(fromRupees('0.1')).toBe(10);
    expect(fromRupees('-70500')).toBe(-7050000);
  });

  it('tolerates grouping commas', () => {
    expect(fromRupees('1,25,000')).toBe(12500000);
    expect(fromRupees('1,250.75')).toBe(125075);
  });

  it('refuses sub-paise precision instead of rounding it away', () => {
    expect(() => fromRupees('10.001')).toThrow(/at most 2 decimal places/);
  });

  it('refuses junk', () => {
    expect(() => fromRupees('abc')).toThrow(MoneyError);
    expect(() => fromRupees('')).toThrow(MoneyError);
  });

  it('round-trips', () => {
    for (const value of ['0.00', '0.01', '1250.75', '125000.00', '-70500.50']) {
      expect(toRupees(fromRupees(value))).toBe(Number(value).toFixed(2));
    }
  });

  it('always renders two decimals', () => {
    expect(toRupees(paise(1))).toBe('0.01');
    expect(toRupees(paise(100))).toBe('1.00');
    expect(toRupees(paise(-1))).toBe('-0.01');
  });
});

describe('database boundary', () => {
  it('reads BIGINT returned as a string', () => {
    expect(fromDatabase('12500000')).toBe(12500000);
    expect(fromDatabase('-7050000')).toBe(-7050000);
    expect(fromDatabase(12500000)).toBe(12500000);
  });

  it('rejects an int64 too large for a JS number rather than truncating it', () => {
    // 2^63 - 1, a legal BIGINT that cannot survive as a JS number.
    expect(() => fromDatabase('9223372036854775807')).toThrow(/precision|safe integer/);
  });

  it('rejects non-integer strings', () => {
    expect(() => fromDatabase('125.75')).toThrow(/integer string/);
    expect(() => fromDatabase('')).toThrow(MoneyError);
  });

  it('serializes as a plain integer string', () => {
    expect(toDatabase(paise(12500000))).toBe('12500000');
  });
});

describe('arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(add(paise(12500000), paise(-7050000))).toBe(paise(5450000));
    expect(subtract(paise(12500000), paise(7050000))).toBe(paise(5450000));
  });

  it('negates and absolutes', () => {
    expect(negate(paise(500))).toBe(paise(-500));
    expect(abs(paise(-500))).toBe(paise(500));
    expect(abs(paise(500))).toBe(paise(500));
  });

  it('sums an empty list to zero', () => {
    expect(sum([])).toBe(ZERO);
  });

  it('multiplies by whole numbers', () => {
    expect(multiplyByInt(paise(3500), 12)).toBe(paise(42000));
  });

  it('rejects fractional multipliers, which would silently round', () => {
    expect(() => multiplyByInt(paise(100), 1.5)).toThrow(/not an integer/);
  });

  it('throws on overflow at the operation that caused it', () => {
    expect(() => add(paise(MAX_PAISE), paise(1))).toThrow(/safe integer range/);
  });
});

describe('scale()', () => {
  it('requires an explicit rounding mode and applies it', () => {
    // ₹1,000 at 7.1% = ₹71.00 exactly
    expect(scale(fromRupees('1000'), 0.071, 'half-up')).toBe(fromRupees('71.00'));
  });

  it('rounds half-up symmetrically across zero', () => {
    expect(scale(paise(5), 0.5, 'half-up')).toBe(paise(3)); // 2.5 → 3
    expect(scale(paise(-5), 0.5, 'half-up')).toBe(paise(-3)); // -2.5 → -3
  });

  it('rounds half-even to the nearest even paisa', () => {
    expect(scale(paise(5), 0.5, 'half-even')).toBe(paise(2)); // 2.5 → 2
    expect(scale(paise(7), 0.5, 'half-even')).toBe(paise(4)); // 3.5 → 4
  });

  it('truncates toward zero for "down" and away for "up"', () => {
    expect(scale(paise(10), 0.19, 'down')).toBe(paise(1)); // 1.9 → 1
    expect(scale(paise(10), 0.11, 'up')).toBe(paise(2)); // 1.1 → 2
    expect(scale(paise(-10), 0.11, 'up')).toBe(paise(-2));
  });
});

describe('comparison helpers', () => {
  it('clamps negatives to zero for "remaining" style figures', () => {
    expect(atLeastZero(paise(-500))).toBe(ZERO);
    expect(atLeastZero(paise(500))).toBe(paise(500));
  });

  it('sorts ascending', () => {
    const sorted = [paise(300), paise(-100), paise(0)].sort(compare);
    expect(sorted).toEqual([paise(-100), ZERO, paise(300)]);
  });
});

describe('allocate()', () => {
  it('distributes every paisa — parts always sum to the whole', () => {
    const parts = allocate(paise(100), [1, 1, 1]);
    expect(sum(parts)).toBe(paise(100));
    // 33.33… each: largest-remainder hands the stray paisa to the first.
    expect(parts).toEqual([paise(34), paise(33), paise(33)]);
  });

  it('splits the PRD budget proportionally without losing a paisa', () => {
    // Travel 5000, eating out 6000, shopping 3000, buffer 5500 → ₹19,500 total
    const total = fromRupees('19500');
    const parts = allocate(total, [5000, 6000, 3000, 5500]);
    expect(sum(parts)).toBe(total);
    expect(parts).toEqual([
      fromRupees('5000'),
      fromRupees('6000'),
      fromRupees('3000'),
      fromRupees('5500'),
    ]);
  });

  it('is deterministic when remainders tie', () => {
    expect(allocate(paise(10), [1, 1, 1, 1])).toEqual([
      paise(3),
      paise(3),
      paise(2),
      paise(2),
    ]);
    // Same input, same output, every time.
    expect(allocate(paise(10), [1, 1, 1, 1])).toEqual(allocate(paise(10), [1, 1, 1, 1]));
  });

  it('handles negative totals without losing a paisa', () => {
    const parts = allocate(paise(-100), [1, 1, 1]);
    expect(sum(parts)).toBe(paise(-100));
  });

  it('handles zero weights among non-zero ones', () => {
    const parts = allocate(paise(100), [1, 0, 1]);
    expect(sum(parts)).toBe(paise(100));
    expect(parts[1]).toBe(ZERO);
  });

  it('rejects degenerate weights rather than inventing a split', () => {
    expect(() => allocate(paise(100), [])).toThrow(/at least one weight/);
    expect(() => allocate(paise(100), [0, 0])).toThrow(/sum to zero/);
    expect(() => allocate(paise(100), [-1, 2])).toThrow(/non-negative/);
  });

  it('never loses a paisa across many awkward splits', () => {
    for (let total = 0; total <= 200; total++) {
      for (const weights of [[1, 1, 1], [1, 2, 3], [7, 11, 13, 17], [1, 1, 1, 1, 1, 1, 1]]) {
        expect(sum(allocate(paise(total), weights))).toBe(paise(total));
      }
    }
  });
});

describe('split()', () => {
  it('divides into equal shares, distributing the remainder', () => {
    expect(split(paise(100), 3)).toEqual([paise(34), paise(33), paise(33)]);
    expect(sum(split(paise(100), 3))).toBe(paise(100));
  });

  it('is identity for one part', () => {
    expect(split(paise(12345), 1)).toEqual([paise(12345)]);
  });

  it('rejects a non-positive or fractional part count', () => {
    expect(() => split(paise(100), 0)).toThrow(/positive integer/);
    expect(() => split(paise(100), 2.5)).toThrow(/positive integer/);
  });
});
