import { describe, expect, it } from 'vitest';

import { parseAmount, parseAmountOrThrow } from './parse';
import { fromRupees } from './paise';

/** Convenience: assert a successful parse equals a rupee string. */
function expectAmount(input: string, rupees: string): void {
  const result = parseAmount(input);
  expect(result, `parsing "${input}"`).toMatchObject({ ok: true });
  if (result.ok) expect(result.amount).toBe(fromRupees(rupees));
}

function expectFailure(input: string, reason?: RegExp): void {
  const result = parseAmount(input);
  expect(result.ok, `parsing "${input}" should fail`).toBe(false);
  if (!result.ok && reason) expect(result.reason).toMatch(reason);
}

describe('parseAmount() — plain numbers', () => {
  it('reads bare rupee amounts', () => {
    expectAmount('300', '300');
    expectAmount('0', '0');
    expectAmount('1250.75', '1250.75');
    expectAmount('0.01', '0.01');
  });

  it('tolerates grouping commas in either convention', () => {
    expectAmount('1,25,000', '125000');
    expectAmount('125,000', '125000');
    expectAmount('1,250.75', '1250.75');
  });

  it('tolerates currency prefixes and whitespace', () => {
    expectAmount('₹500', '500');
    expectAmount('Rs 500', '500');
    expectAmount('Rs. 500', '500');
    expectAmount('INR 500', '500');
    expectAmount('  ₹ 1,250.75  ', '1250.75');
  });

  it('reads an explicit sign', () => {
    expectAmount('-300', '-300');
    expectAmount('+300', '300');
  });
});

describe('parseAmount() — Indian scales', () => {
  it('reads lakh in its many spellings', () => {
    expectAmount('1.25 lakh', '125000');
    expectAmount('1.25lakh', '125000');
    expectAmount('1.25 lakhs', '125000');
    expectAmount('1.25 lac', '125000');
    expectAmount('2L', '200000');
  });

  it('reads crore', () => {
    expectAmount('2 cr', '20000000');
    expectAmount('1.5 crore', '15000000');
  });

  it('reads thousands', () => {
    expectAmount('1.5k', '1500');
    expectAmount('5 thousand', '5000');
    expectAmount('70.5k', '70500');
  });

  it('applies the multiplier exactly, not in floating point', () => {
    // 1.25 × 100000 in floats is fine here, but 0.07 × 100000 is not —
    // this asserts the integer path.
    expectAmount('0.07 lakh', '7000');
    expectAmount('1.0001 lakh', '100010');
  });

  it('handles the PRD salary phrasing', () => {
    expectAmount('1.25 lakh', '125000');
    expectAmount('₹1.3 lakh', '130000');
  });
});

describe('parseAmount() — refusals', () => {
  it('never guesses at empty or junk input', () => {
    expectFailure('', /No amount/);
    expectFailure('   ', /No amount/);
    expectFailure('abc', /not a recognisable amount|contains no digits/);
    expectFailure('₹', /contains no digits/);
  });

  it('rejects unknown units rather than assuming rupees', () => {
    expectFailure('5 bananas', /Unrecognised unit/);
    expectFailure('100 usd', /Unrecognised unit/);
  });

  it('rejects malformed decimals', () => {
    expectFailure('1.2.3', /not a recognisable amount|more than one decimal/);
  });

  it('rejects sub-paise precision instead of rounding it away', () => {
    expectFailure('10.001', /more precise than one paisa/);
  });

  it('rejects amounts beyond the representable range', () => {
    expectFailure('99999999 cr', /too large|maximum/);
  });

  it('rejects non-string input defensively', () => {
    // AI and form payloads are untrusted; a number here must not crash the parser.
    expectFailure(undefined as unknown as string, /must be text/);
    expectFailure(42 as unknown as string, /must be text/);
  });
});

describe('parseAmountOrThrow()', () => {
  it('returns the amount for trusted callers', () => {
    expect(parseAmountOrThrow('1.25 lakh')).toBe(fromRupees('125000'));
  });

  it('throws with the underlying reason', () => {
    expect(() => parseAmountOrThrow('nonsense')).toThrow(/parseAmountOrThrow/);
  });
});
