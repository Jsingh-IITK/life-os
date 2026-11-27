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
const INCOME = /\b(?:received|got paid|credited|mila|mile|aaya|aaye|refund)\b/i;
/** "salary" is income unless it is salary paid to someone. */
const SALARY = /\bsalary\b/i;
const PAID_STAFF = /\b(?:maid|bai|didi|cook|driver|staff|helper|nanny|guard|watchman)\b/i;

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
 * Cue words for common spending, each with the words a matching category
 * name is likely to contain, best first. Cues only ever map onto a category
 * the user actually has; with none matching, the stub proposes nothing.
 * More specific cues come first so "whey" beats "food".
 */
const CATEGORY_CUES: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/\b(?:whey|creatine|protein|supplements?|pre-?workout)\b/i, ['whey', 'creatine', 'supplement', 'protein', 'nutrition']],
  [/\b(?:gym|boxing|muay\s*thai|kickboxing|bjj|trainer|coach|membership)\b/i, ['gym', 'boxing', 'fitness', 'sport']],
  [/\b(?:maid|bai|cook|tiffin|didi)\b/i, ['maid', 'household', 'home', 'food']],
  [/\b(?:grocery|groceries|sabzi|sabji|kirana|ration|blinkit|zepto|bigbasket|instamart|milk|doodh|eggs|anda)\b/i, ['grocer', 'kirana', 'food']],
  [/\b(?:lunch|dinner|breakfast|brunch|zomato|swiggy|restaurant|cafe|coffee|chai|tea|snacks?|pizza|burger|biryani|momos|party|drinks|beer|bar|treat)\b/i, ['eating', 'dining', 'restaurant', 'social', 'food']],
  [/\b(?:petrol|diesel|fuel|bike|service|puncture|parking|toll)\b/i, ['petrol', 'fuel', 'bike', 'vehicle', 'car', 'transport']],
  [/\b(?:uber|ola|rapido|auto|cab|taxi|metro|bus)\b/i, ['transport', 'commute', 'cab', 'travel', 'petrol']],
  [/\b(?:flight|hotel|trip|irctc|train|makemytrip|goibibo|airbnb|holiday|vacation)\b/i, ['travel', 'trip', 'holiday']],
  [/\b(?:amazon|flipkart|myntra|ajio|clothes|kapde|shirt|jeans|shoes|haircut|salon|barber|grooming|perfume)\b/i, ['shopping', 'grooming', 'clothes', 'personal']],
  [/\b(?:electricity|bijli|power bill)\b/i, ['electric', 'utilit', 'bill', 'power']],
  [/\b(?:recharge|wifi|wi-fi|internet|broadband|airtel|jio|vi|mobile bill|phone bill)\b/i, ['mobile', 'wi-fi', 'wifi', 'internet', 'phone', 'bill']],
  [/\b(?:rent|kiraya)\b/i, ['rent', 'housing']],
  [/\b(?:doctor|medicine|medicines|dawai|pharmacy|hospital|clinic|insurance|premium|test|lab)\b/i, ['health', 'medical', 'insurance', 'doctor']],
  [/\b(?:netflix|spotify|prime|hotstar|youtube|icloud|chatgpt|subscription)\b/i, ['subscription', 'entertainment', 'ott']],
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
  for (const [cue, nameWords] of CATEGORY_CUES) {
    const hit = cue.exec(text);
    if (!hit) continue;
    for (const word of nameWords) {
      const name = categories.find((c) => c.toLowerCase().includes(word));
      if (name) return { name, cue: hit[0] };
    }
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

  if (INCOME.test(text) || (SALARY.test(text) && !PAID_STAFF.test(text))) return empty;
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
