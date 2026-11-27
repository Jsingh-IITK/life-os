/**
 * Picks the ONE module a message belongs to.
 *
 * Only the chosen module's tools are offered to the model, so a fitness
 * request can never be answered with financial data (PRD security rules).
 * Deterministic and keyword-based: routing is a safety boundary, not a task
 * for the model.
 *
 * Training words are split by strength. Set/rep notation and exercise names
 * are unmistakably a workout. Words like "gym" or "boxing" are also things
 * people pay for, so "500 for gym" is spending, not a workout. A message
 * with both a money signal and a strong training signal is refused as mixed.
 */

export type Module = 'finance' | 'fitness';

export type Route =
  | { readonly module: Module }
  | { readonly module: null; readonly reason: 'unclear' | 'mixed' };

const MONEY = [
  /₹|\brs\.?\s*\d|\binr\b|\brupees?\b|\bpaise\b/i,
  /\b\d[\d,]*(?:\.\d+)?\s*(?:k|l|lakh|lakhs|lac|cr|crore|hazaar|hazar)\b/i,
  /\b(?:spent|spend|paid|pay|bought|buy|purchase|bill|expense|kharch|kharcha|kharche|diya|diye|gaye|gaya|lagaa|laga|lage|salary|income|upi|gpay|phonepe|paytm|card|cash|emi|rent|fees?|membership|zomato|swiggy|uber|ola)\b/i,
];

const STRONG_TRAINING = [
  /\b(?:bench|squat|deadlift|ohp|overhead press|row|rows|curl|curls|pull-?ups?|push-?ups?|chin-?ups?|lat pulldown|dips?|lunges?|reps?|sets?|rir)\b/i,
  /\b\d+(?:\.\d+)?\s*(?:kg|kgs)\b/i,
  /\b\d+\s*(?:x|×)\s*\d+\b/i,
  /\b\d+(?:\.\d+)?\s*km\b/i,
];

const WEAK_TRAINING = /\b(?:workout|gym|boxing|muay\s*thai|kickboxing|bjj|sparring|run|ran|training)\b/i;

/** A bare amount: a number that is not a weight, distance or set count. */
const BARE_NUMBER = /\b\d[\d,]*(?:\.\d+)?\b/;

const any = (text: string, patterns: readonly RegExp[]) => patterns.some((p) => p.test(text));

export function routeMessage(text: string): Route {
  const money = any(text, MONEY);
  const strongTraining = any(text, STRONG_TRAINING);

  if (money && strongTraining) return { module: null, reason: 'mixed' };
  if (money) return { module: 'finance' };
  if (strongTraining) return { module: 'fitness' };

  // No explicit signal either way. A plain number reads as an amount ("500
  // for gym", "chai 40"); training words alone read as training.
  if (BARE_NUMBER.test(text)) return { module: 'finance' };
  if (WEAK_TRAINING.test(text)) return { module: 'fitness' };
  return { module: null, reason: 'unclear' };
}
