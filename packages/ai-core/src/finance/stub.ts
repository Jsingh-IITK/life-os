/**
 * The deterministic stub: reads a short English or Hinglish spending message
 * with rules, and produces the same proposal shape a model would.
 *
 * D8: the pipeline (routing, validation, drafts, confirmation, logging) is
 * built and tested against this before any provider sees real data. It is
 * deliberately conservative: anything it cannot read stays null, and the
 * validator then asks rather than guesses.
 */

import type { ExpenseProposal, PaymentMethod } from './proposal';

const AMOUNT =
  /(?:₹|\brs\.?|\binr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakhs?|lacs?|cr|crores?|hazaar|hazar|thousand)?(?![\w.])/i;

/** Words that mean money came in. The stub only records expenses. */
const INCOME = /\b(?:salary|received|got paid|credited|mila|mile|aaya|aaye|refund)\b/i;

const PAYMENT: ReadonlyArray<readonly [RegExp, PaymentMethod]> = [
  [/\b(?:upi|gpay|google pay|phonepe|phone pe|paytm|bhim)\b/i, 'upi'],
  [/\bcredit\s*card\b|\bcc\b/i, 'credit_card'],
  [/\bdebit\s*card\b/i, 'debit_card'],
  [/\b(?:cash|nakad|nakd)\b/i, 'cash'],
  [/\b(?:bank transfer|neft|imps|rtgs)\b/i, 'bank_transfer'],
];

const MERCHANTS = [
  'Zomato', 'Swiggy', 'Uber', 'Ola', 'Rapido', 'Amazon', 'Flipkart', 'Myntra',
  'Blinkit', 'Zepto', 'BigBasket', 'Instamart', 'Netflix', 'Spotify', 'Airtel', 'Jio',
];

/**
 * Cue words for common spending, keyed by a word likely to appear in the
 * user's own category name. Only ever maps onto a category the user has.
 */
const CATEGORY_CUES: ReadonlyArray<readonly [string, RegExp]> = [
  ['food', /\b(?:lunch|dinner|breakfast|khana|khaana|nashta|chai|coffee|snacks?|restaurant|zomato|swiggy|pizza|biryani)\b/i],
  ['grocer', /\b(?:grocery|groceries|sabzi|sabji|kirana|ration|blinkit|zepto|bigbasket|instamart|milk|doodh)\b/i],
  ['transport', /\b(?:uber|ola|rapido|auto|cab|taxi|metro|bus|train|petrol|diesel|fuel)\b/i],
  ['travel', /\b(?:flight|hotel|trip|irctc|makemytrip)\b/i],
  ['shopping', /\b(?:amazon|flipkart|myntra|clothes|kapde|shoes|shopping)\b/i],
  ['eating', /\b(?:restaurant|dinner out|cafe|zomato|swiggy)\b/i],
  ['bill', /\b(?:electricity|bijli|wifi|internet|broadband|recharge|airtel|jio|bill)\b/i],
  ['rent', /\b(?:rent|kiraya)\b/i],
  ['health', /\b(?:doctor|medicine|dawai|pharmacy|hospital|gym membership)\b/i],
  ['entertainment', /\b(?:movie|netflix|spotify|concert|game)\b/i],
];

const DATE_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:today|aaj)\b/i, 'today'],
  [/\byesterday\b/i, 'yesterday'],
  // "kal" means both yesterday and tomorrow, so it is left unresolved.
];

function findCategory(text: string, categories: readonly string[]): { name: string; cue: string } | null {
  // The user's own category named outright wins.
  for (const name of categories) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return { name, cue: name };
  }
  for (const [key, cue] of CATEGORY_CUES) {
    const hit = cue.exec(text);
    if (!hit) continue;
    const name = categories.find((c) => c.toLowerCase().includes(key));
    if (name) return { name, cue: hit[0] };
  }
  return null;
}

export function stubExpenseProposal(text: string, categories: readonly string[]): ExpenseProposal {
  const empty: ExpenseProposal = {
    intent: 'unsupported',
    amount_text: null,
    date: null,
    merchant: null,
    category: null,
    payment_method: null,
    description: null,
  };

  if (INCOME.test(text)) return empty;
  const amount = AMOUNT.exec(text);
  if (!amount) return empty;

  const merchant = MERCHANTS.find((m) => new RegExp(`\\b${m}\\b`, 'i').test(text)) ?? null;
  const category = findCategory(text, categories);

  return {
    intent: 'record_expense',
    amount_text: amount[0].trim(),
    date: DATE_WORDS.find(([re]) => re.test(text))?.[1] ?? null,
    merchant,
    category: category?.name ?? null,
    payment_method: PAYMENT.find(([re]) => re.test(text))?.[1] ?? null,
    description: category && category.cue !== category.name ? category.cue.toLowerCase() : null,
  };
}
