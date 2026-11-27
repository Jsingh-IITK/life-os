import { describe, expect, it } from 'vitest';

import { expenseProposalSchema } from './proposal';
import { stubExpenseProposal } from './stub';
import { validateExpenseProposal } from './validate';

const CATEGORIES = [
  { id: 'c-food', name: 'Food & dining' },
  { id: 'c-groc', name: 'Groceries' },
  { id: 'c-trans', name: 'Transport' },
  { id: 'c-shop', name: 'Shopping' },
];
const NAMES = CATEGORIES.map((c) => c.name);
const TODAY = '2026-11-27';

const draftOf = (text: string) => {
  const result = validateExpenseProposal(stubExpenseProposal(text, NAMES), {
    categories: CATEGORIES,
    today: TODAY,
  });
  if (!result.ok) throw new Error(`expected a draft for "${text}", got ${result.reason}`);
  return result.draft;
};

describe('stub → validated draft, English and Hinglish', () => {
  it('reads a plain English expense', () => {
    const d = draftOf('spent 300 on lunch via upi');
    expect(d.amount).toBe(30_000);
    expect(d.categoryId).toBe('c-food');
    expect(d.paymentMethod).toBe('upi');
    expect(d.description).toBe('lunch');
  });

  it('reads Hinglish', () => {
    const d = draftOf('aaj lunch pe 250 gaye gpay se');
    expect(d.amount).toBe(25_000);
    expect(d.date).toBe(TODAY);
    expect(d.categoryId).toBe('c-food');
    expect(d.paymentMethod).toBe('upi');
  });

  it('reads Indian-scale shorthand exactly', () => {
    expect(draftOf('1.5k on groceries at blinkit').amount).toBe(150_000);
    expect(draftOf('rent 2 hazaar').amount).toBe(200_000);
  });

  it('keeps the amount text it parsed', () => {
    expect(draftOf('₹1,250 uber').amountText).toBe('₹1,250');
  });

  it('recognises a merchant and maps it to the user\'s own category', () => {
    const d = draftOf('uber 340');
    expect(d.merchant).toBe('Uber');
    expect(d.categoryName).toBe('Transport');
  });

  it('never infers a payment method that was not said', () => {
    expect(draftOf('dinner 800').paymentMethod).toBeNull();
    // "card" alone could be credit or debit: left unresolved.
    expect(draftOf('dinner 800 by card').paymentMethod).toBeNull();
  });

  it('resolves yesterday against the user\'s today', () => {
    expect(draftOf('yesterday coffee 180').date).toBe('2026-11-26');
  });

  it('leaves "kal" unresolved, since it means yesterday and tomorrow', () => {
    const d = draftOf('kal chai 40');
    expect(d.date).toBe(TODAY);
    expect(d.warnings).toContain('date_assumed_today');
  });

  it('asks for a category rather than guessing one', () => {
    const d = draftOf('paid 500 to Ramesh');
    expect(d.categoryId).toBeNull();
    expect(d.missing).toEqual(['category']);
  });

  it('does not treat income as an expense', () => {
    const p = stubExpenseProposal('salary 1.25 lakh credited', NAMES);
    expect(p.intent).toBe('unsupported');
  });

  it('a message with no amount is unsupported, not zero', () => {
    expect(stubExpenseProposal('had lunch with friends', NAMES).intent).toBe('unsupported');
  });
});

describe('validation treats any proposal as untrusted', () => {
  const ctx = { categories: CATEGORIES, today: TODAY };
  const base = {
    intent: 'record_expense',
    amount_text: '300',
    date: 'today',
    merchant: null,
    category: 'Food & dining',
    payment_method: null,
    description: null,
  };

  it('accepts a well-formed proposal', () => {
    expect(validateExpenseProposal(base, ctx).ok).toBe(true);
  });

  it('parses the amount itself; a model cannot hand over a computed figure', () => {
    const r = validateExpenseProposal({ ...base, amount_text: 'three hundred' }, ctx);
    expect(r).toMatchObject({ ok: false, reason: 'bad_amount' });
  });

  it('rejects a zero amount', () => {
    expect(validateExpenseProposal({ ...base, amount_text: '0' }, ctx)).toMatchObject({
      ok: false,
      reason: 'bad_amount',
    });
  });

  it('refuses a category the user does not have', () => {
    const r = validateExpenseProposal({ ...base, category: 'Crypto' }, ctx);
    expect(r.ok && r.draft.categoryId).toBe(null);
    expect(r.ok && r.draft.warnings).toContain('category_not_recognised');
  });

  it('matches the user\'s category case-insensitively', () => {
    const r = validateExpenseProposal({ ...base, category: 'food & DINING' }, ctx);
    expect(r.ok && r.draft.categoryId).toBe('c-food');
  });

  it('drops an unknown payment method rather than storing it', () => {
    const r = validateExpenseProposal({ ...base, payment_method: 'bitcoin' }, ctx);
    expect(r.ok && r.draft.paymentMethod).toBeNull();
    expect(r.ok && r.draft.warnings).toContain('payment_method_not_recognised');
  });

  it('rejects an impossible date', () => {
    expect(validateExpenseProposal({ ...base, date: '2026-02-30' }, ctx)).toMatchObject({
      ok: false,
      reason: 'bad_date',
    });
  });

  it('flags a future date instead of filing it as done', () => {
    const r = validateExpenseProposal({ ...base, date: '2026-11-30' }, ctx);
    expect(r.ok && r.draft.warnings).toContain('future_date');
  });

  it('strips control characters and bounds free text', () => {
    const r = validateExpenseProposal({ ...base, merchant: 'Café\u0000\n' + 'x'.repeat(200) }, ctx);
    expect(r.ok && r.draft.merchant?.includes('\u0000')).toBe(false);
    expect(r.ok && (r.draft.merchant?.length ?? 0)).toBeLessThanOrEqual(80);
  });

  it('rejects non-objects and unknown intents', () => {
    expect(validateExpenseProposal('spent 300', ctx)).toMatchObject({ ok: false, reason: 'malformed' });
    expect(validateExpenseProposal(null, ctx)).toMatchObject({ ok: false, reason: 'malformed' });
    expect(validateExpenseProposal({ ...base, intent: 'delete_everything' }, ctx)).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('the schema given to the model', () => {
  it('limits categories to the user\'s own names', () => {
    const schema = expenseProposalSchema(NAMES) as {
      properties: { category: { anyOf: { enum?: string[] }[] } };
    };
    expect(schema.properties.category.anyOf[0]?.enum).toEqual(NAMES);
  });

  it('requires every field so nothing is silently omitted', () => {
    const schema = expenseProposalSchema(NAMES) as { required: string[]; properties: object };
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
  });
});
