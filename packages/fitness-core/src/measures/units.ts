/**
 * Integer measures for training data.
 *
 * The no-floating-point rule is not finance-specific. Training volume is a sum
 * of (weight x reps) over thousands of sets, and plate weights are routinely
 * fractional (2.5kg, 1.25kg micro-plates). Accumulating those as floats drifts
 * exactly the way rupees do, so weights are stored as whole grams, durations as
 * whole seconds and distances as whole metres.
 *
 * This mirrors `@life-os/finance-core`'s paise module deliberately: one rule,
 * applied in both domains.
 */

declare const GRAMS_BRAND: unique symbol;
declare const SECONDS_BRAND: unique symbol;
declare const METRES_BRAND: unique symbol;
declare const REPS_BRAND: unique symbol;

/** A whole number of grams. 60kg = 60000. */
export type Grams = number & { readonly [GRAMS_BRAND]: true };
/** A whole number of seconds. */
export type Seconds = number & { readonly [SECONDS_BRAND]: true };
/** A whole number of metres. */
export type Metres = number & { readonly [METRES_BRAND]: true };
/** A non-negative whole repetition count. */
export type Reps = number & { readonly [REPS_BRAND]: true };

export class MeasureError extends Error {
  override readonly name = 'MeasureError';
}

function assertWholeNonNegative(value: number, unit: string, context: string): void {
  if (!Number.isFinite(value)) {
    throw new MeasureError(`${context}: expected a finite ${unit}, received ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new MeasureError(
      `${context}: expected whole ${unit}, received ${value}. Round explicitly at the boundary.`,
    );
  }
  if (value < 0) {
    throw new MeasureError(`${context}: ${unit} cannot be negative, received ${value}`);
  }
  if (value > Number.MAX_SAFE_INTEGER) {
    throw new MeasureError(`${context}: ${value} ${unit} exceeds the safe integer range`);
  }
}

export const grams = (value: number): Grams => {
  assertWholeNonNegative(value, 'grams', 'grams()');
  return value as Grams;
};

export const seconds = (value: number): Seconds => {
  assertWholeNonNegative(value, 'seconds', 'seconds()');
  return value as Seconds;
};

export const metres = (value: number): Metres => {
  assertWholeNonNegative(value, 'metres', 'metres()');
  return value as Metres;
};

export const reps = (value: number): Reps => {
  assertWholeNonNegative(value, 'reps', 'reps()');
  return value as Reps;
};

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

/**
 * Parse a kilogram figure exactly. Accepts up to three decimals (1g resolution),
 * which covers every real plate increment including 1.25kg micro-plates.
 */
export function fromKilograms(kg: string | number): Grams {
  const text = typeof kg === 'number' ? String(kg) : kg.trim();
  const match = /^(\d*)(?:\.(\d{0,3}))?$/.exec(text);
  if (!match || (match[1] === '' && match[2] === undefined)) {
    throw new MeasureError(
      `fromKilograms(): "${kg}" is not a kilogram value with at most 3 decimal places`,
    );
  }
  const [, whole = '0', decimals = ''] = match;
  return grams(Number(whole || '0') * 1000 + Number(decimals.padEnd(3, '0')));
}

/** Exact decimal-string kilograms, trailing zeros stripped: 62500 -> "62.5" */
export function toKilograms(weight: Grams): string {
  const whole = Math.trunc(weight / 1000);
  const fraction = weight % 1000;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}`;
}

/** Display form: "60kg", "62.5kg", "bodyweight" when zero. */
export function formatWeight(weight: Grams): string {
  if (weight === 0) return 'bodyweight';
  return `${toKilograms(weight)}kg`;
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

export const fromMinutes = (minutes: number): Seconds => {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new MeasureError(`fromMinutes(): invalid minutes ${minutes}`);
  }
  return seconds(Math.round(minutes * 60));
};

/** "45s", "12m", "12m 30s", "1h 05m" */
export function formatDuration(duration: Seconds): string {
  if (duration < 60) return `${duration}s`;

  const hours = Math.trunc(duration / 3600);
  const minutes = Math.trunc((duration % 3600) / 60);
  const secs = duration % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return secs === 0 ? `${minutes}m` : `${minutes}m ${secs}s`;
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

export const fromKilometres = (km: number): Metres => {
  if (!Number.isFinite(km) || km < 0) {
    throw new MeasureError(`fromKilometres(): invalid kilometres ${km}`);
  }
  return metres(Math.round(km * 1000));
};

/** "400m", "5km", "5.5km" */
export function formatDistance(distance: Metres): string {
  if (distance < 1000) return `${distance}m`;
  const whole = Math.trunc(distance / 1000);
  const fraction = distance % 1000;
  if (fraction === 0) return `${whole}km`;
  return `${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}km`;
}

/**
 * Pace as seconds per kilometre. Returns null for zero distance rather than
 * Infinity, so callers must handle "no pace" explicitly instead of rendering it.
 */
export function paceSecondsPerKm(distance: Metres, duration: Seconds): number | null {
  if (distance === 0) return null;
  return Math.round((duration * 1000) / distance);
}

/** "5:30 /km" */
export function formatPace(secondsPerKm: number): string {
  const mins = Math.trunc(secondsPerKm / 60);
  const secs = secondsPerKm % 60;
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}
