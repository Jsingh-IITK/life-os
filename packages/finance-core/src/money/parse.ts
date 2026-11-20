/**
 * Parsing user- and AI-supplied amount text into exact paise.
 *
 * Used by manual entry today and by conversational entry later. It returns a
 * result rather than throwing, and it never guesses: anything it cannot read
 * exactly comes back as a failure so the caller can ask the user, which is the
 * PRD's "do not silently guess missing information" rule expressed in code.
 *
 * All arithmetic is integer-only — the multiplier is applied to paise, so
 * "1.25 lakh" is exact rather than 1.25 * 100000 in floating point.
 */

import { MAX_PAISE, type Paise, paise } from './paise';

export type ParseResult =
  | { readonly ok: true; readonly amount: Paise }
  | { readonly ok: false; readonly reason: string };

/** Indian-scale multipliers, in rupees. */
const MULTIPLIERS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(?:cr|crore|crores|karod)$/i, 1_00_00_000],
  [/^(?:l|lakh|lakhs|lac|lacs|lakhs?)$/i, 1_00_000],
  [/^(?:k|thousand|hazaar|hazar)$/i, 1_000],
];

const CURRENCY_PREFIX = /^(?:₹|rs\.?|inr)\s*/i;

/**
 * Parse an amount.
 *
 *   "300"         → 30000 paise
 *   "1,250.75"    → 125075 paise
 *   "₹1.25 lakh"  → 12500000 paise
 *   "1.5k"        → 150000 paise
 *   "2 cr"        → 2000000000 paise
 */
export function parseAmount(input: string): ParseResult {
  if (typeof input !== 'string') {
    return { ok: false, reason: 'Amount must be text.' };
  }

  let text = input.trim().toLowerCase();
  if (text === '') {
    return { ok: false, reason: 'No amount provided.' };
  }

  // Sign
  let sign = 1;
  if (text.startsWith('-')) {
    sign = -1;
    text = text.slice(1).trim();
  } else if (text.startsWith('+')) {
    text = text.slice(1).trim();
  }

  text = text.replace(CURRENCY_PREFIX, '').trim();

  // Split "1.25 lakh" / "1.25lakh" into digits and an optional unit.
  const match = /^([\d,]*\.?\d*)\s*([a-z.]*)$/.exec(text);
  if (!match) {
    return { ok: false, reason: `"${input}" is not a recognisable amount.` };
  }

  const [, rawDigits = '', rawUnit = ''] = match;
  const digits = rawDigits.replace(/,/g, '');

  if (digits === '' || digits === '.') {
    return { ok: false, reason: `"${input}" contains no digits.` };
  }
  if ((digits.match(/\./g) ?? []).length > 1) {
    return { ok: false, reason: `"${input}" has more than one decimal point.` };
  }

  let multiplier = 1;
  if (rawUnit !== '') {
    const unit = rawUnit.replace(/\.$/, '');
    const found = MULTIPLIERS.find(([pattern]) => pattern.test(unit));
    if (!found) {
      return { ok: false, reason: `Unrecognised unit "${rawUnit}" in "${input}".` };
    }
    multiplier = found[1];
  }

  const [wholePart = '0', fractionPart = ''] = digits.split('.');
  const fractionDigits = fractionPart.length;

  // Exact integer evaluation:
  //   paise = digitsAsInteger × 100 × multiplier ÷ 10^fractionDigits
  const digitsAsInteger = Number(`${wholePart || '0'}${fractionPart}`);
  if (!Number.isSafeInteger(digitsAsInteger)) {
    return { ok: false, reason: `"${input}" has too many digits to represent exactly.` };
  }

  const numerator = digitsAsInteger * 100 * multiplier;
  const denominator = 10 ** fractionDigits;

  if (!Number.isSafeInteger(numerator)) {
    return { ok: false, reason: `"${input}" is too large to represent exactly.` };
  }
  if (numerator % denominator !== 0) {
    return {
      ok: false,
      reason: `"${input}" is more precise than one paisa. Round it before entry.`,
    };
  }

  const amount = sign * (numerator / denominator);
  if (Math.abs(amount) > MAX_PAISE) {
    return { ok: false, reason: `"${input}" exceeds the maximum supported amount.` };
  }

  return { ok: true, amount: paise(amount) };
}

/** Throwing variant for trusted callers (tests, seeds, constants). */
export function parseAmountOrThrow(input: string): Paise {
  const result = parseAmount(input);
  if (!result.ok) {
    throw new Error(`parseAmountOrThrow(): ${result.reason}`);
  }
  return result.amount;
}
