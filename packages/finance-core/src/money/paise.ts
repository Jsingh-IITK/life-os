/**
 * Integer paise — the only authoritative money representation in Life OS.
 *
 * Why integers: ₹0.01 is not representable in binary floating point, so
 * `0.1 + 0.2 !== 0.3` applies directly to rupee arithmetic. Every authoritative
 * total, balance and report is therefore computed in whole paise.
 *
 * Why `number` and not `bigint`: Number.MAX_SAFE_INTEGER is 9,007,199,254,740,991
 * paise ≈ ₹90.07 trillion, which exceeds any personal-finance figure by many
 * orders of magnitude. Every constructor and every arithmetic result is checked
 * against that bound, so an overflow throws rather than silently losing precision.
 * The database column is BIGINT; `assertSafe` is the boundary that guarantees the
 * value survived the trip intact.
 */

declare const PAISE_BRAND: unique symbol;

/** A whole number of paise. Construct via {@link paise} — never cast. */
export type Paise = number & { readonly [PAISE_BRAND]: true };

/** Largest representable amount: ₹90,071,992,547,409.91 */
export const MAX_PAISE = Number.MAX_SAFE_INTEGER;
export const MIN_PAISE = -Number.MAX_SAFE_INTEGER;

export const ZERO = 0 as Paise;

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

function assertSafe(value: number, context: string): asserts value is Paise {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${context}: expected a finite amount, received ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `${context}: expected whole paise, received ${value}. ` +
        `Fractional paise cannot be represented — round explicitly at the boundary.`,
    );
  }
  if (value > MAX_PAISE || value < MIN_PAISE) {
    throw new MoneyError(`${context}: ${value} paise exceeds the safe integer range`);
  }
}

/** Construct a Paise value from a whole number of paise. */
export function paise(value: number): Paise {
  assertSafe(value, 'paise()');
  return value;
}

/** True when `value` is a usable Paise amount. Does not throw. */
export function isPaise(value: unknown): value is Paise {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value <= MAX_PAISE &&
    value >= MIN_PAISE
  );
}

/**
 * Read an amount that arrived from Postgres. BIGINT is returned as a string by
 * the Supabase client specifically because int64 does not fit in a JS number;
 * parsing through this function is what makes that safe rather than lossy.
 */
export function fromDatabase(value: string | number): Paise {
  if (typeof value === 'number') {
    assertSafe(value, 'fromDatabase()');
    return value;
  }
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new MoneyError(`fromDatabase(): expected an integer string, received "${value}"`);
  }
  const parsed = Number(trimmed);
  assertSafe(parsed, 'fromDatabase()');
  // Round-trip check: catches int64 values too large for a JS number.
  if (String(parsed) !== trimmed) {
    throw new MoneyError(`fromDatabase(): "${value}" loses precision as a JS number`);
  }
  return parsed;
}

/** Serialize for a BIGINT column. */
export function toDatabase(amount: Paise): string {
  return String(amount);
}

/**
 * Convert from rupees expressed as a decimal *string* — the only exact route.
 * Accepts at most two decimal places; more is an error rather than a silent round,
 * because silently discarding a third decimal is how reconciliation breaks.
 */
export function fromRupees(rupees: string): Paise {
  const trimmed = rupees.trim().replace(/,/g, '');
  const match = /^(-)?(\d*)(?:\.(\d{0,2}))?$/.exec(trimmed);
  if (!match || (match[2] === '' && match[3] === undefined)) {
    throw new MoneyError(
      `fromRupees(): "${rupees}" is not a rupee amount with at most 2 decimal places`,
    );
  }
  const [, sign, whole = '0', decimals = ''] = match;
  const padded = decimals.padEnd(2, '0');
  const magnitude = Number(whole) * 100 + Number(padded);
  const signed = sign === '-' ? -magnitude : magnitude;
  assertSafe(signed, 'fromRupees()');
  return signed;
}

/** Exact decimal-string representation in rupees, always 2 decimal places. */
export function toRupees(amount: Paise): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Arithmetic. Every result is re-checked, so overflow throws at the operation
// that caused it rather than surfacing as a wrong total somewhere downstream.
// ---------------------------------------------------------------------------

export function add(a: Paise, b: Paise): Paise {
  const result = a + b;
  assertSafe(result, 'add()');
  return result;
}

export function subtract(a: Paise, b: Paise): Paise {
  const result = a - b;
  assertSafe(result, 'subtract()');
  return result;
}

export function negate(amount: Paise): Paise {
  return paise(-amount);
}

export function abs(amount: Paise): Paise {
  return paise(Math.abs(amount));
}

export function sum(amounts: readonly Paise[]): Paise {
  let total = 0;
  for (const amount of amounts) {
    total += amount;
    assertSafe(total, 'sum()');
  }
  return total as Paise;
}

/** Multiply by a whole number — exact. */
export function multiplyByInt(amount: Paise, factor: number): Paise {
  if (!Number.isInteger(factor)) {
    throw new MoneyError(`multiplyByInt(): factor ${factor} is not an integer`);
  }
  const result = amount * factor;
  assertSafe(result, 'multiplyByInt()');
  return result;
}

export type Rounding = 'half-up' | 'half-even' | 'down' | 'up';

/**
 * Scale by a real-valued rate (an interest rate, a percentage, a NAV).
 * Rounding is a required argument: there is no safe default, and making the
 * caller name it keeps the choice visible wherever money is approximated.
 */
export function scale(amount: Paise, rate: number, rounding: Rounding): Paise {
  if (!Number.isFinite(rate)) {
    throw new MoneyError(`scale(): rate ${rate} is not finite`);
  }
  return paise(roundTo(amount * rate, rounding));
}

function roundTo(value: number, rounding: Rounding): number {
  switch (rounding) {
    case 'down':
      return Math.trunc(value);
    case 'up':
      return value < 0 ? Math.floor(value) : Math.ceil(value);
    case 'half-up': {
      // Symmetric: -0.5 → -1, 0.5 → 1. Math.round alone is asymmetric for negatives.
      const sign = value < 0 ? -1 : 1;
      return sign * Math.round(Math.abs(value));
    }
    case 'half-even': {
      const floor = Math.floor(value);
      const diff = value - floor;
      if (diff > 0.5) return floor + 1;
      if (diff < 0.5) return floor;
      return floor % 2 === 0 ? floor : floor + 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export const isZero = (a: Paise): boolean => a === 0;
export const isNegative = (a: Paise): boolean => a < 0;
export const isPositive = (a: Paise): boolean => a > 0;
export const equals = (a: Paise, b: Paise): boolean => a === b;
export const lessThan = (a: Paise, b: Paise): boolean => a < b;
export const greaterThan = (a: Paise, b: Paise): boolean => a > b;

/** Sort comparator: ascending. */
export const compare = (a: Paise, b: Paise): number => (a < b ? -1 : a > b ? 1 : 0);

export const min = (a: Paise, b: Paise): Paise => (a < b ? a : b);
export const max = (a: Paise, b: Paise): Paise => (a > b ? a : b);

/** Clamp to zero — useful for "remaining budget" style figures. */
export const atLeastZero = (a: Paise): Paise => (a < 0 ? ZERO : a);

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/**
 * Split `total` across `weights` so the parts sum to exactly `total`.
 *
 * Uses the largest-remainder method: floor every share, then hand the leftover
 * paise one at a time to the largest remainders. A naive proportional split
 * loses or invents paise, which is how a budget's parts stop summing to its whole.
 *
 * Ties go to the earlier index, making the result deterministic and testable.
 */
export function allocate(total: Paise, weights: readonly number[]): Paise[] {
  if (weights.length === 0) {
    throw new MoneyError('allocate(): needs at least one weight');
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new MoneyError('allocate(): weights must be finite and non-negative');
  }

  const weightTotal = weights.reduce((acc, w) => acc + w, 0);
  if (weightTotal === 0) {
    throw new MoneyError('allocate(): weights sum to zero');
  }

  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);

  const exact = weights.map((w) => (magnitude * w) / weightTotal);
  const shares = exact.map((value) => Math.floor(value));
  const distributed = shares.reduce((acc, s) => acc + s, 0);

  let remainder = magnitude - distributed;
  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of byRemainder) {
    if (remainder <= 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    remainder -= 1;
  }

  return shares.map((share) => paise(sign * share));
}

/** Split into `parts` equal shares, distributing any leftover paise. */
export function split(total: Paise, parts: number): Paise[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError(`split(): parts must be a positive integer, received ${parts}`);
  }
  return allocate(total, new Array<number>(parts).fill(1));
}
