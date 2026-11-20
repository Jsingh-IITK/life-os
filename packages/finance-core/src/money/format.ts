/**
 * INR formatting with Indian digit grouping.
 *
 * Implemented by hand rather than via Intl.NumberFormat: React Native's Hermes
 * engine ships a reduced ICU dataset, so `en-IN` grouping is not dependable
 * across web and Android. Doing it manually keeps output identical everywhere,
 * which also makes it snapshot-testable.
 */

import { type Paise, toRupees } from './paise';

export const RUPEE = '₹';

/**
 * Group digits the Indian way: last three, then pairs.
 * 1234567 → "12,34,567"
 */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const pairs = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${pairs},${last3}`;
}

export interface FormatOptions {
  /**
   * 'auto'   — show paise only when non-zero (default)
   * 'always' — always two decimals
   * 'never'  — whole rupees only, truncated toward zero
   */
  readonly paise?: 'auto' | 'always' | 'never';
  /** Include the ₹ symbol. Default true. */
  readonly symbol?: boolean;
  /** 'auto' shows a minus for negatives (default); 'always' also shows + for positives. */
  readonly sign?: 'auto' | 'always';
}

/**
 * Format an amount as INR.
 *   formatINR(paise(12500000))              → "₹1,25,000"
 *   formatINR(paise(125075))                → "₹1,250.75"
 *   formatINR(paise(-70500_00 as number))   → "-₹70,500"
 */
export function formatINR(amount: Paise, options: FormatOptions = {}): string {
  const { paise: paiseMode = 'auto', symbol = true, sign = 'auto' } = options;

  const decimal = toRupees(amount);
  const negative = decimal.startsWith('-');
  const unsigned = negative ? decimal.slice(1) : decimal;
  const [whole = '0', fraction = '00'] = unsigned.split('.');

  const showFraction =
    paiseMode === 'always' || (paiseMode === 'auto' && fraction !== '00');

  const body = showFraction
    ? `${groupIndian(whole)}.${fraction}`
    : groupIndian(whole);

  const signPrefix = negative ? '-' : sign === 'always' ? '+' : '';
  return `${signPrefix}${symbol ? RUPEE : ''}${body}`;
}

/**
 * Compact Indian form for dense UI — lakh and crore.
 *   formatCompactINR(paise(12500000))    → "₹1.25L"
 *   formatCompactINR(paise(250000000))   → "₹25L"
 *   formatCompactINR(paise(1500000000))  → "₹1.5Cr"
 *
 * Lossy by design: never use it for a figure the user must reconcile.
 */
export function formatCompactINR(amount: Paise): string {
  const negative = amount < 0;
  const rupees = Math.abs(amount) / 100;
  const prefix = `${negative ? '-' : ''}${RUPEE}`;

  const render = (value: number, suffix: string): string => {
    // Two significant decimals, trailing zeros stripped: 1.50 → "1.5", 25.00 → "25"
    const fixed = value.toFixed(2).replace(/\.?0+$/, '');
    return `${prefix}${fixed}${suffix}`;
  };

  if (rupees >= 1_00_00_000) return render(rupees / 1_00_00_000, 'Cr');
  if (rupees >= 1_00_000) return render(rupees / 1_00_000, 'L');
  if (rupees >= 1_000) return render(rupees / 1_000, 'K');
  return formatINR(amount, { paise: 'auto' });
}
