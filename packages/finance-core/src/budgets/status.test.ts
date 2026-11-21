import { describe, expect, it } from 'vitest';

import { fromRupees } from '../money/paise';
import { allocationStatus, budgetSummary, carryForward } from './status';

const alloc = (planned: string, actual: string, extra: Partial<{ rollover: boolean; carriedIn: string }> = {}) => ({
  categoryId: 'cat',
  categoryName: 'Groceries',
  planned: fromRupees(planned),
  actual: fromRupees(actual),
  ...(extra.rollover !== undefined ? { rollover: extra.rollover } : {}),
  ...(extra.carriedIn !== undefined ? { carriedIn: fromRupees(extra.carriedIn) } : {}),
});

describe('allocationStatus', () => {
  it('reports what is left', () => {
    const s = allocationStatus(alloc('5000', '2000'));
    expect(s.remaining).toBe(fromRupees('3000'));
    expect(s.overspend).toBe(fromRupees('0'));
    expect(s.utilisation).toBeCloseTo(0.4);
    expect(s.health).toBe('on-track');
  });

  it('never reports a negative remainder', () => {
    // "You have −₹200 left" is not a thing to tell someone; "you are ₹200
    // over" is. Overspend is therefore its own field.
    const s = allocationStatus(alloc('5000', '5200'));
    expect(s.remaining).toBe(fromRupees('0'));
    expect(s.overspend).toBe(fromRupees('200'));
    expect(s.health).toBe('over');
  });

  it('caps utilisation for bars but reports the real figure too', () => {
    const s = allocationStatus(alloc('1000', '1500'));
    expect(s.utilisation).toBe(1);          // a bar cannot exceed its track
    expect(s.rawUtilisation).toBeCloseTo(1.5); // but 150% is the truth
  });

  it('warns before the limit, not at it', () => {
    expect(allocationStatus(alloc('1000', '840')).health).toBe('on-track');
    expect(allocationStatus(alloc('1000', '850')).health).toBe('close');
    expect(allocationStatus(alloc('1000', '1000')).health).toBe('close');
    expect(allocationStatus(alloc('1000', '1001')).health).toBe('over');
  });

  it('distinguishes untouched from on-track', () => {
    expect(allocationStatus(alloc('5000', '0')).health).toBe('unspent');
  });

  it('treats spending against an unfunded category as fully over', () => {
    // Rather than dividing by zero.
    const s = allocationStatus(alloc('0', '500'));
    expect(s.health).toBe('over');
    expect(s.overspend).toBe(fromRupees('500'));
    expect(Number.isFinite(s.rawUtilisation)).toBe(true);
  });

  it('an empty unfunded category is simply unspent', () => {
    const s = allocationStatus(alloc('0', '0'));
    expect(s.health).toBe('unspent');
    expect(s.utilisation).toBe(0);
  });

  it('adds anything carried in to what is available', () => {
    // Without the ₹1,000 carried in this would be ₹500 over; with it there is
    // ₹500 left. Still 92% used, so "close" rather than "on-track".
    const s = allocationStatus(alloc('5000', '5500', { carriedIn: '1000' }));
    expect(s.available).toBe(fromRupees('6000'));
    expect(s.remaining).toBe(fromRupees('500'));
    expect(s.overspend).toBe(fromRupees('0'));
    expect(s.health).toBe('close');
  });
});

describe('budgetSummary', () => {
  const summary = budgetSummary([
    { categoryId: 'rent', categoryName: 'Rent', planned: fromRupees('33200'), actual: fromRupees('33200') },
    { categoryId: 'groc', categoryName: 'Groceries', planned: fromRupees('5000'), actual: fromRupees('5600') },
    { categoryId: 'gym', categoryName: 'Gym', planned: fromRupees('5000'), actual: fromRupees('0') },
  ]);

  it('totals the plan and the spending', () => {
    expect(summary.totalPlanned).toBe(fromRupees('43200'));
    expect(summary.totalActual).toBe(fromRupees('38800'));
  });

  it('totals are the sum of the rows, so header and rows cannot disagree', () => {
    const rowRemaining = summary.allocations.reduce((n, a) => n + a.remaining, 0);
    const rowOverspend = summary.allocations.reduce((n, a) => n + a.overspend, 0);
    expect(summary.totalRemaining).toBe(rowRemaining);
    expect(summary.totalOverspend).toBe(rowOverspend);
  });

  it('reports overspend separately from remaining', () => {
    // Gym still has ₹5,000 unspent while groceries is ₹600 over. Netting
    // these would hide the overspend behind an unrelated underspend.
    expect(summary.totalRemaining).toBe(fromRupees('5000'));
    expect(summary.totalOverspend).toBe(fromRupees('600'));
  });

  it('names the categories that went over', () => {
    expect(summary.overCategories.map((a) => a.categoryName)).toEqual(['Groceries']);
  });

  it('handles a budget with no allocations', () => {
    const empty = budgetSummary([]);
    expect(empty.totalPlanned).toBe(fromRupees('0'));
    expect(empty.utilisation).toBe(0);
    expect(empty.overCategories).toEqual([]);
  });
});

describe('carryForward', () => {
  it('carries an unspent remainder when configured', () => {
    expect(carryForward(allocationStatus(alloc('5000', '3000')), true)).toBe(fromRupees('2000'));
  });

  it('carries nothing when not configured', () => {
    expect(carryForward(allocationStatus(alloc('5000', '3000')), false)).toBe(fromRupees('0'));
  });

  it("does not carry an overspend forward as next month's debt", () => {
    // Rollover is a carried allowance. Quietly shrinking next month's budget
    // because of last month would confront the user with a number they never
    // set.
    expect(carryForward(allocationStatus(alloc('5000', '6000')), true)).toBe(fromRupees('0'));
  });
});
