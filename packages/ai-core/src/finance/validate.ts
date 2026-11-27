/**
 * Validation of an expense proposal from a model or the stub.
 *
 * The proposal is untrusted input. Nothing in it is believed until checked
 * here: the amount is parsed by finance-core (the model never supplies a
 * computed figure), the category must be one of the user's own, the payment
 * method is kept only if it is a known value, and dates are resolved against
 * the user's today by code. What cannot be resolved is reported as missing
 * so the user is asked, never filled in.
 */

import { Money } from '@life-os/finance-core';

import { PAYMENT_METHODS, type PaymentMethod } from './proposal';

export interface CategoryRef {
  readonly id: string;
  readonly name: string;
}

export type DraftWarning =
  | 'date_assumed_today'
  | 'future_date'
  | 'category_not_recognised'
  | 'payment_method_not_recognised';

export interface ExpenseDraft {
  readonly amount: Money.Paise;
  /** The amount text the draft came from, shown beside the parsed figure. */
  readonly amountText: string;
  readonly date: string;
  readonly merchant: string | null;
  readonly description: string | null;
  readonly paymentMethod: PaymentMethod | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  /** Fields the user must supply before this can be saved. */
  readonly missing: readonly 'category'[];
  readonly warnings: readonly DraftWarning[];
}

export type ValidationResult =
  | { readonly ok: true; readonly draft: ExpenseDraft }
  | { readonly ok: false; readonly reason: 'unsupported' | 'malformed' | 'no_amount' | 'bad_amount' | 'bad_date'; readonly detail: string };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(iso: string): boolean {
  const m = DATE.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function previousDay(iso: string): string {
  const m = DATE.exec(iso)!;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Trims, strips control characters and bounds length; empty becomes null. */
function cleanText(value: unknown, max = 80): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, max);
}

export function validateExpenseProposal(
  raw: unknown,
  context: { readonly categories: readonly CategoryRef[]; readonly today: string },
): ValidationResult {
  if (!isRealDate(context.today)) {
    throw new Error(`validateExpenseProposal: today must be YYYY-MM-DD, received "${context.today}"`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'malformed', detail: 'The proposal was not an object.' };
  }
  const p = raw as Record<string, unknown>;

  if (p.intent !== 'record_expense') {
    return {
      ok: false,
      reason: p.intent === 'unsupported' ? 'unsupported' : 'malformed',
      detail: 'That message does not describe money spent.',
    };
  }

  const amountText = cleanText(p.amount_text, 40);
  if (amountText === null) {
    return { ok: false, reason: 'no_amount', detail: 'How much was it?' };
  }
  const parsed = Money.parseAmount(amountText);
  if (!parsed.ok) return { ok: false, reason: 'bad_amount', detail: parsed.reason };
  if (!Money.isPositive(parsed.amount)) {
    return { ok: false, reason: 'bad_amount', detail: 'An expense must be more than zero.' };
  }

  const warnings: DraftWarning[] = [];

  let date: string;
  if (p.date === null || p.date === undefined) {
    date = context.today;
    warnings.push('date_assumed_today');
  } else if (p.date === 'today') {
    date = context.today;
  } else if (p.date === 'yesterday') {
    date = previousDay(context.today);
  } else if (typeof p.date === 'string' && isRealDate(p.date)) {
    date = p.date;
  } else {
    return { ok: false, reason: 'bad_date', detail: `"${String(p.date)}" is not a date I can use.` };
  }
  if (date > context.today) warnings.push('future_date');

  let category: CategoryRef | null = null;
  if (typeof p.category === 'string') {
    const wanted = p.category.trim().toLowerCase();
    category = context.categories.find((c) => c.name.trim().toLowerCase() === wanted) ?? null;
    if (!category) warnings.push('category_not_recognised');
  }

  let paymentMethod: PaymentMethod | null = null;
  if (p.payment_method !== null && p.payment_method !== undefined) {
    if ((PAYMENT_METHODS as readonly unknown[]).includes(p.payment_method)) {
      paymentMethod = p.payment_method as PaymentMethod;
    } else {
      warnings.push('payment_method_not_recognised');
    }
  }

  return {
    ok: true,
    draft: {
      amount: parsed.amount,
      amountText,
      date,
      merchant: cleanText(p.merchant),
      description: cleanText(p.description),
      paymentMethod,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      missing: category ? [] : ['category'],
      warnings,
    },
  };
}
