import { describe, expect, it } from 'vitest';

import { formatCompactINR, formatINR, groupIndian } from './format';
import { fromRupees, paise } from './paise';

describe('groupIndian()', () => {
  it('leaves up to three digits alone', () => {
    expect(groupIndian('0')).toBe('0');
    expect(groupIndian('70')).toBe('70');
    expect(groupIndian('500')).toBe('500');
  });

  it('groups the last three digits, then pairs', () => {
    expect(groupIndian('1000')).toBe('1,000');
    expect(groupIndian('70500')).toBe('70,500');
    expect(groupIndian('125000')).toBe('1,25,000');
    expect(groupIndian('1234567')).toBe('12,34,567');
    expect(groupIndian('100000000')).toBe('10,00,00,000');
  });

  it('is not western grouping', () => {
    // The whole point: 1,25,000 rather than 125,000.
    expect(groupIndian('125000')).not.toBe('125,000');
  });
});

describe('formatINR()', () => {
  it('formats the PRD seed figures as an Indian reader expects', () => {
    expect(formatINR(fromRupees('125000'))).toBe('₹1,25,000');
    expect(formatINR(fromRupees('130000'))).toBe('₹1,30,000');
    expect(formatINR(fromRupees('70500'))).toBe('₹70,500');
    expect(formatINR(fromRupees('35000'))).toBe('₹35,000');
    expect(formatINR(fromRupees('33200'))).toBe('₹33,200');
    expect(formatINR(fromRupees('5500'))).toBe('₹5,500');
    expect(formatINR(fromRupees('800'))).toBe('₹800');
  });

  it('shows paise only when they are non-zero by default', () => {
    expect(formatINR(fromRupees('1250.75'))).toBe('₹1,250.75');
    expect(formatINR(fromRupees('1250.00'))).toBe('₹1,250');
    expect(formatINR(fromRupees('1250.50'))).toBe('₹1,250.50');
  });

  it('honours an explicit paise mode', () => {
    expect(formatINR(fromRupees('1250'), { paise: 'always' })).toBe('₹1,250.00');
    expect(formatINR(fromRupees('1250.75'), { paise: 'never' })).toBe('₹1,250');
  });

  it('places the minus sign outside the symbol', () => {
    expect(formatINR(fromRupees('-70500'))).toBe('-₹70,500');
    expect(formatINR(fromRupees('-1250.75'))).toBe('-₹1,250.75');
  });

  it('can show an explicit plus for deltas', () => {
    expect(formatINR(fromRupees('5000'), { sign: 'always' })).toBe('+₹5,000');
    expect(formatINR(fromRupees('-5000'), { sign: 'always' })).toBe('-₹5,000');
  });

  it('can omit the symbol', () => {
    expect(formatINR(fromRupees('125000'), { symbol: false })).toBe('1,25,000');
  });

  it('formats zero and single paise', () => {
    expect(formatINR(paise(0))).toBe('₹0');
    expect(formatINR(paise(1))).toBe('₹0.01');
    expect(formatINR(paise(0), { paise: 'always' })).toBe('₹0.00');
  });
});

describe('formatCompactINR()', () => {
  it('uses Indian scales', () => {
    expect(formatCompactINR(fromRupees('125000'))).toBe('₹1.25L');
    expect(formatCompactINR(fromRupees('2500000'))).toBe('₹25L');
    expect(formatCompactINR(fromRupees('15000000'))).toBe('₹1.5Cr');
    expect(formatCompactINR(fromRupees('5000'))).toBe('₹5K');
  });

  it('strips trailing zeros', () => {
    expect(formatCompactINR(fromRupees('100000'))).toBe('₹1L');
    expect(formatCompactINR(fromRupees('1000000'))).toBe('₹10L');
  });

  it('falls back to full formatting below a thousand', () => {
    expect(formatCompactINR(fromRupees('300'))).toBe('₹300');
    expect(formatCompactINR(fromRupees('999'))).toBe('₹999');
  });

  it('keeps the sign', () => {
    expect(formatCompactINR(fromRupees('-125000'))).toBe('-₹1.25L');
  });
});
