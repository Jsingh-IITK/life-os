import { describe, expect, it } from 'vitest';

import { routeMessage } from '../router';
import { type AccountRef, type PastExpense, completeDraft } from './complete';
import { stubExpenseProposal } from './stub';
import { validateExpenseProposal } from './validate';

// A real chart of accounts (names only), so the cues are tested against the
// names people actually use rather than tidy generic ones.
const NAMES = [
  'Bike & petrol', 'Buffer', 'Eating out & social', 'Electricity', 'Food & maid', 'Groceries',
  'Gym & boxing', 'Health & term insurance', 'Mobile & Wi-Fi', 'Rent', 'Shopping & grooming',
  'Subscriptions', 'Travel', 'Whey & creatine',
];
const CATEGORIES = NAMES.map((name, i) => ({ id: `c${i}`, name }));
const idOf = (name: string) => CATEGORIES.find((c) => c.name === name)!.id;

const CANARA = 'a-canara';
const ICICI_SAL = 'a-icici';
const SBI_CC = 'k-sbi';
const ICICI_CC = 'k-icici';

const ACCOUNTS_CANARA_DEFAULT: AccountRef[] = [
  { id: CANARA, kind: 'asset', isDefault: true },
  { id: ICICI_SAL, kind: 'asset', isDefault: false },
  { id: SBI_CC, kind: 'card', isDefault: false },
  { id: ICICI_CC, kind: 'card', isDefault: false },
];
const ACCOUNTS_CARD_DEFAULT: AccountRef[] = ACCOUNTS_CANARA_DEFAULT.map((a) => ({
  ...a,
  isDefault: a.id === SBI_CC,
}));

function draftFor(
  text: string,
  options: { history?: PastExpense[]; accounts?: AccountRef[]; recentCardId?: string | null } = {},
) {
  const v = validateExpenseProposal(stubExpenseProposal(text, NAMES), {
    categories: CATEGORIES,
    today: '2026-11-28',
  });
  if (!v.ok) throw new Error(`no draft for "${text}": ${v.reason}`);
  return completeDraft(v.draft, {
    categories: CATEGORIES,
    history: options.history ?? [],
    accounts: options.accounts ?? ACCOUNTS_CANARA_DEFAULT,
    recentCardId: options.recentCardId ?? null,
  });
}

describe('"500 for gym" is spending, not a workout', () => {
  it('routes amounts with training words to finance', () => {
    expect(routeMessage('500 for gym')).toEqual({ module: 'finance' });
    expect(routeMessage('gym membership 2000')).toEqual({ module: 'finance' });
    expect(routeMessage('boxing fees 1500')).toEqual({ module: 'finance' });
  });

  it('still routes real training to fitness', () => {
    expect(routeMessage('went to the gym')).toEqual({ module: 'fitness' });
    expect(routeMessage('ran 5 km')).toEqual({ module: 'fitness' });
    expect(routeMessage('bench 60kg x 8')).toEqual({ module: 'fitness' });
  });

  it('files it under the gym category', () => {
    expect(draftFor('500 for gym').categoryId).toBe(idOf('Gym & boxing'));
  });
});

describe('category is picked without asking', () => {
  it.each([
    ['lunch 250', 'Eating out & social'],
    ['zomato 480', 'Eating out & social'],
    ['petrol 300', 'Bike & petrol'],
    // No transport category: a cab is not the user's bike, so Travel.
    ['uber 220', 'Travel'],
    ['whey 3200', 'Whey & creatine'],
    ['maid salary 4000', 'Food & maid'],
    ['blinkit 650', 'Groceries'],
    ['jio recharge 299', 'Mobile & Wi-Fi'],
    ['netflix 649', 'Subscriptions'],
    ['haircut 300', 'Shopping & grooming'],
    ['flight 5400', 'Travel'],
    ['electricity bill 1800', 'Electricity'],
    ['rent 18000', 'Rent'],
    ['medicine 450', 'Health & term insurance'],
  ])('"%s" → %s', (text, category) => {
    const d = draftFor(text);
    expect(d.categoryName).toBe(category);
    expect(d.missing).toEqual([]);
  });

  it('past choices beat the built-in cues', () => {
    // "chai" is cued to eating out, but this user files chai under Food & maid.
    const history: PastExpense[] = [
      { merchant: null, description: 'chai', categoryId: idOf('Food & maid'), date: '2026-11-20' },
      { merchant: null, description: 'chai', categoryId: idOf('Food & maid'), date: '2026-11-22' },
    ];
    const d = draftFor('chai 40', { history });
    expect(d.categoryName).toBe('Food & maid');
    expect(d.categorySource).toBe('history');
  });

  it('a merchant is filed where it was filed before', () => {
    const history: PastExpense[] = [
      { merchant: 'Swiggy', description: null, categoryId: idOf('Groceries'), date: '2026-11-25' },
    ];
    expect(draftFor('swiggy 300', { history }).categoryName).toBe('Groceries');
  });

  it('the most frequent past category wins, then the most recent', () => {
    const history: PastExpense[] = [
      { merchant: 'Amazon', description: null, categoryId: idOf('Shopping & grooming'), date: '2026-10-01' },
      { merchant: 'Amazon', description: null, categoryId: idOf('Shopping & grooming'), date: '2026-10-02' },
      { merchant: 'Amazon', description: null, categoryId: idOf('Groceries'), date: '2026-11-27' },
    ];
    expect(draftFor('amazon 999', { history }).categoryName).toBe('Shopping & grooming');
  });

  it('history pointing at an archived category is ignored', () => {
    const history: PastExpense[] = [{ merchant: 'Uber', description: null, categoryId: 'gone', date: '2026-11-01' }];
    expect(draftFor('uber 200', { history }).categoryName).toBe('Travel');
  });

  it('with no cue and no history, the catch-all is used and says so', () => {
    const d = draftFor('paid 500 to Ramesh');
    expect(d.categoryName).toBe('Buffer');
    expect(d.categorySource).toBe('fallback');
  });
});

describe('account is picked without asking', () => {
  it('unstated payment uses the default account', () => {
    const d = draftFor('lunch 250');
    expect(d.accountId).toBe(CANARA);
    expect(d.accountSource).toBe('default');
  });

  it('UPI uses the default bank account', () => {
    expect(draftFor('lunch 250 upi').accountId).toBe(CANARA);
  });

  it('"credit card" uses the card used most recently', () => {
    const d = draftFor('dinner 1200 credit card', { recentCardId: ICICI_CC });
    expect(d.accountId).toBe(ICICI_CC);
    expect(d.accountSource).toBe('recent_card');
  });

  it('"credit card" with two cards and no history is left to the user', () => {
    expect(draftFor('dinner 1200 credit card').accountId).toBeNull();
  });

  it('cash is never filed as leaving the bank', () => {
    expect(draftFor('chai 40 cash').accountId).toBeNull();
  });

  it('UPI is never charged to a card, even when a card is the default', () => {
    expect(draftFor('lunch 250 upi', { accounts: ACCOUNTS_CARD_DEFAULT }).accountId).toBeNull();
  });
});
