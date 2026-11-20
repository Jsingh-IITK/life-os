import { describe, expect, it } from 'vitest';

import { fromRupees, sum, type Paise } from '../money/paise';
import { accountsTouched, assertBalanced, buildPostings, isBalanced, netFor } from './build';
import { PostingError, type Leg } from './types';

/**
 * A minimal chart of accounts. Classes are declared here so the tests can
 * assert what a transaction touches — "no expense leg exists" is the actual
 * claim being made, not "the total happened to stay the same".
 */
const BANK = 'acct-bank';
const SAVINGS = 'acct-savings';
const CARD = 'acct-card';
const MF = 'acct-mutual-fund';
const GROCERIES = 'cat-groceries';
const RENT = 'cat-rent';
const SALARY = 'inc-salary';
const GAINS = 'inc-realized-gains';
const EQUITY = 'eq-opening';

const CLASS: Record<string, 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY'> = {
  [BANK]: 'ASSET',
  [SAVINGS]: 'ASSET',
  [MF]: 'ASSET',
  [CARD]: 'LIABILITY',
  [GROCERIES]: 'EXPENSE',
  [RENT]: 'EXPENSE',
  [SALARY]: 'INCOME',
  [GAINS]: 'INCOME',
  [EQUITY]: 'EQUITY',
};

/** Total posted to EXPENSE accounts — the definition of "spending". */
const spend = (legs: readonly Leg[]): Paise =>
  sum(legs.filter((l) => CLASS[l.accountId] === 'EXPENSE').map((l) => l.amount));

const touchesClass = (legs: readonly Leg[], cls: string): boolean =>
  legs.some((l) => CLASS[l.accountId] === cls);

describe('every transaction balances', () => {
  it('rejects legs that do not sum to zero', () => {
    expect(() =>
      assertBalanced([
        { accountId: GROCERIES, amount: fromRupees('300') },
        { accountId: BANK, amount: fromRupees('-200') },
      ]),
    ).toThrow(/sum to/);
  });

  it('rejects a single leg', () => {
    expect(() => assertBalanced([{ accountId: BANK, amount: fromRupees('300') }])).toThrow(
      /at least two/,
    );
  });

  it('rejects a zero-amount leg', () => {
    expect(() =>
      assertBalanced([
        { accountId: BANK, amount: fromRupees('0') },
        { accountId: GROCERIES, amount: fromRupees('0') },
      ]),
    ).toThrow(/carries no information/);
  });

  it('isBalanced reports rather than throws', () => {
    expect(isBalanced(buildPostings({
      type: 'expense',
      amount: fromRupees('300'),
      categoryAccountId: GROCERIES,
      paidFromAccountId: BANK,
    }))).toBe(true);
    expect(isBalanced([{ accountId: BANK, amount: fromRupees('1') }])).toBe(false);
  });
});

describe('expense', () => {
  const legs = buildPostings({
    type: 'expense',
    amount: fromRupees('300'),
    categoryAccountId: GROCERIES,
    paidFromAccountId: BANK,
  });

  it('reduces the account balance', () => {
    expect(netFor(legs, BANK)).toBe(fromRupees('-300'));
  });

  it('increases expenditure', () => {
    expect(spend(legs)).toBe(fromRupees('300'));
  });

  it('refuses a negative amount — direction comes from the type, not the sign', () => {
    expect(() =>
      buildPostings({
        type: 'expense',
        amount: fromRupees('-300'),
        categoryAccountId: GROCERIES,
        paidFromAccountId: BANK,
      }),
    ).toThrow(PostingError);
  });
});

describe('income', () => {
  const legs = buildPostings({
    type: 'income',
    amount: fromRupees('125000'),
    incomeAccountId: SALARY,
    depositedToAccountId: BANK,
  });

  it('increases the account balance', () => {
    expect(netFor(legs, BANK)).toBe(fromRupees('125000'));
  });

  it('records income and no expenditure', () => {
    expect(netFor(legs, SALARY)).toBe(fromRupees('-125000'));
    expect(spend(legs)).toBe(fromRupees('0'));
  });
});

describe('transfer', () => {
  const legs = buildPostings({
    type: 'transfer',
    amount: fromRupees('10000'),
    fromAccountId: BANK,
    toAccountId: SAVINGS,
  });

  it('moves money without changing total assets', () => {
    expect(netFor(legs, BANK)).toBe(fromRupees('-10000'));
    expect(netFor(legs, SAVINGS)).toBe(fromRupees('10000'));
    expect(sum(legs.map((l) => l.amount))).toBe(fromRupees('0'));
  });

  it('is not expenditure — there is no expense leg to find', () => {
    expect(spend(legs)).toBe(fromRupees('0'));
    expect(touchesClass(legs, 'EXPENSE')).toBe(false);
  });

  it('is not income either', () => {
    expect(touchesClass(legs, 'INCOME')).toBe(false);
  });

  it('refuses a transfer to the same account', () => {
    expect(() =>
      buildPostings({
        type: 'transfer',
        amount: fromRupees('100'),
        fromAccountId: BANK,
        toAccountId: BANK,
      }),
    ).toThrow(/different accounts/);
  });
});

describe('credit card', () => {
  const purchase = buildPostings({
    type: 'cc_purchase',
    amount: fromRupees('2000'),
    categoryAccountId: GROCERIES,
    cardAccountId: CARD,
  });

  const repayment = buildPostings({
    type: 'cc_repayment',
    amount: fromRupees('2000'),
    cardAccountId: CARD,
    paidFromAccountId: BANK,
  });

  it('a purchase is expenditure at the time of purchase, and raises the liability', () => {
    expect(spend(purchase)).toBe(fromRupees('2000'));
    // Debit-positive: a credit to a liability is negative, raising what is owed.
    expect(netFor(purchase, CARD)).toBe(fromRupees('-2000'));
  });

  it('a repayment settles the liability from cash', () => {
    expect(netFor(repayment, CARD)).toBe(fromRupees('2000'));
    expect(netFor(repayment, BANK)).toBe(fromRupees('-2000'));
  });

  it('a repayment does not duplicate expenditure', () => {
    expect(spend(repayment)).toBe(fromRupees('0'));
    expect(touchesClass(repayment, 'EXPENSE')).toBe(false);
  });

  it('purchase then repayment leaves the card settled and spending counted once', () => {
    const both = [...purchase, ...repayment];
    expect(netFor(both, CARD)).toBe(fromRupees('0'));
    expect(spend(both)).toBe(fromRupees('2000'));
  });
});

describe('investments', () => {
  const buy = buildPostings({
    type: 'investment_buy',
    amount: fromRupees('5000'),
    investmentAccountId: MF,
    paidFromAccountId: BANK,
  });

  it('a purchase moves value from cash to an investment asset', () => {
    expect(netFor(buy, BANK)).toBe(fromRupees('-5000'));
    expect(netFor(buy, MF)).toBe(fromRupees('5000'));
  });

  it('a purchase is not a lifestyle expense', () => {
    expect(spend(buy)).toBe(fromRupees('0'));
    expect(touchesClass(buy, 'EXPENSE')).toBe(false);
  });

  it('a redemption at a gain reduces the holding at cost and recognises the gain', () => {
    const legs = buildPostings({
      type: 'investment_sell',
      proceeds: fromRupees('6000'),
      costBasis: fromRupees('5000'),
      investmentAccountId: MF,
      depositedToAccountId: BANK,
      realizedGainAccountId: GAINS,
    });
    expect(netFor(legs, BANK)).toBe(fromRupees('6000'));
    expect(netFor(legs, MF)).toBe(fromRupees('-5000'));
    expect(netFor(legs, GAINS)).toBe(fromRupees('-1000'));
    expect(spend(legs)).toBe(fromRupees('0'));
  });

  it('a redemption at a loss debits the gain account instead', () => {
    const legs = buildPostings({
      type: 'investment_sell',
      proceeds: fromRupees('4000'),
      costBasis: fromRupees('5000'),
      investmentAccountId: MF,
      depositedToAccountId: BANK,
      realizedGainAccountId: GAINS,
    });
    expect(netFor(legs, GAINS)).toBe(fromRupees('1000'));
    expect(sum(legs.map((l) => l.amount))).toBe(fromRupees('0'));
  });

  it('a break-even redemption posts no gain leg at all', () => {
    const legs = buildPostings({
      type: 'investment_sell',
      proceeds: fromRupees('5000'),
      costBasis: fromRupees('5000'),
      investmentAccountId: MF,
      depositedToAccountId: BANK,
      realizedGainAccountId: GAINS,
    });
    expect(accountsTouched(legs)).toEqual([BANK, MF]);
    expect(legs).toHaveLength(2);
  });
});

describe('refund', () => {
  const expense = buildPostings({
    type: 'expense',
    amount: fromRupees('300'),
    categoryAccountId: GROCERIES,
    paidFromAccountId: BANK,
  });
  const refund = buildPostings({
    type: 'refund',
    amount: fromRupees('300'),
    categoryAccountId: GROCERIES,
    refundedToAccountId: BANK,
  });

  it('adjusts the original expense down rather than recording income', () => {
    expect(spend([...expense, ...refund])).toBe(fromRupees('0'));
    expect(touchesClass(refund, 'INCOME')).toBe(false);
  });

  it('returns the money to the account', () => {
    expect(netFor([...expense, ...refund], BANK)).toBe(fromRupees('0'));
  });

  it('a partial refund nets the category down by that much', () => {
    const partial = buildPostings({
      type: 'refund',
      amount: fromRupees('100'),
      categoryAccountId: GROCERIES,
      refundedToAccountId: BANK,
    });
    expect(spend([...expense, ...partial])).toBe(fromRupees('200'));
  });
});

describe('opening balance', () => {
  it('establishes a starting balance against equity, not income', () => {
    const legs = buildPostings({
      type: 'opening_balance',
      amount: fromRupees('50000'),
      accountId: BANK,
      equityAccountId: EQUITY,
    });
    expect(netFor(legs, BANK)).toBe(fromRupees('50000'));
    expect(touchesClass(legs, 'INCOME')).toBe(false);
    expect(spend(legs)).toBe(fromRupees('0'));
  });

  it('supports a negative opening balance, for a card already carrying debt', () => {
    const legs = buildPostings({
      type: 'opening_balance',
      amount: fromRupees('-8000'),
      accountId: CARD,
      equityAccountId: EQUITY,
    });
    expect(netFor(legs, CARD)).toBe(fromRupees('-8000'));
    expect(sum(legs.map((l) => l.amount))).toBe(fromRupees('0'));
  });

  it('refuses a zero opening balance', () => {
    expect(() =>
      buildPostings({
        type: 'opening_balance',
        amount: fromRupees('0'),
        accountId: BANK,
        equityAccountId: EQUITY,
      }),
    ).toThrow(/nothing to record/);
  });
});

describe('adjustment', () => {
  it('accepts caller-supplied legs when they balance', () => {
    const legs = buildPostings({
      type: 'adjustment',
      legs: [
        { accountId: BANK, amount: fromRupees('-50') },
        { accountId: RENT, amount: fromRupees('50') },
      ],
    });
    expect(legs).toHaveLength(2);
  });

  it('still refuses unbalanced legs', () => {
    expect(() =>
      buildPostings({
        type: 'adjustment',
        legs: [
          { accountId: BANK, amount: fromRupees('-50') },
          { accountId: RENT, amount: fromRupees('40') },
        ],
      }),
    ).toThrow(/sum to/);
  });
});

describe('a month of activity', () => {
  it('counts spending exactly once across every transaction type', () => {
    const all = [
      ...buildPostings({ type: 'income', amount: fromRupees('125000'), incomeAccountId: SALARY, depositedToAccountId: BANK }),
      ...buildPostings({ type: 'expense', amount: fromRupees('33200'), categoryAccountId: RENT, paidFromAccountId: BANK }),
      ...buildPostings({ type: 'cc_purchase', amount: fromRupees('5000'), categoryAccountId: GROCERIES, cardAccountId: CARD }),
      ...buildPostings({ type: 'cc_repayment', amount: fromRupees('5000'), cardAccountId: CARD, paidFromAccountId: BANK }),
      ...buildPostings({ type: 'transfer', amount: fromRupees('35000'), fromAccountId: BANK, toAccountId: SAVINGS }),
      ...buildPostings({ type: 'investment_buy', amount: fromRupees('5000'), investmentAccountId: MF, paidFromAccountId: BANK }),
      ...buildPostings({ type: 'refund', amount: fromRupees('200'), categoryAccountId: GROCERIES, refundedToAccountId: BANK }),
    ];

    // Rent 33,200 + groceries 5,000 − refund 200. The transfer, the card
    // repayment and the investment contribute nothing.
    expect(spend(all)).toBe(fromRupees('38000'));

    // 125,000 − 33,200 − 5,000 − 35,000 − 5,000 + 200
    expect(netFor(all, BANK)).toBe(fromRupees('47000'));
    expect(netFor(all, SAVINGS)).toBe(fromRupees('35000'));
    expect(netFor(all, MF)).toBe(fromRupees('5000'));
    expect(netFor(all, CARD)).toBe(fromRupees('0'));

    // The whole month still balances.
    expect(sum(all.map((l) => l.amount))).toBe(fromRupees('0'));
  });
});
