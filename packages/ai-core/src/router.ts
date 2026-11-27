/**
 * Picks the ONE module a message belongs to.
 *
 * Only the chosen module's tools are offered to the model, so a fitness
 * request can never be answered with financial data (PRD security rules).
 * Deterministic and keyword-based: routing is a safety boundary, not a task
 * for the model. Ambiguous or mixed messages are refused rather than guessed.
 */

export type Module = 'finance' | 'fitness';

export type Route =
  | { readonly module: Module }
  | { readonly module: null; readonly reason: 'unclear' | 'mixed' };

const FINANCE = [
  /₹|\brs\.?\s*\d|\binr\b|\brupees?\b|\bpaise\b/i,
  /\b\d[\d,]*(?:\.\d+)?\s*(?:k|l|lakh|lakhs|lac|cr|crore|hazaar|hazar)\b/i,
  /\b(?:spent|spend|paid|pay|bought|buy|purchase|bill|expense|kharch|kharcha|kharche|diya|diye|gaye|lagaa|laga|lage|salary|income|upi|gpay|phonepe|paytm|card|cash|emi|rent|zomato|swiggy|uber|ola)\b/i,
];

const FITNESS = [
  /\b(?:bench|squat|deadlift|press|row|curl|pull-?ups?|push-?ups?|lat|dips?|lunges?|reps?|sets?)\b/i,
  /\b\d+\s*(?:kg|kgs)\s*(?:x|×|for)\s*\d+/i,
  /\b(?:workout|gym|boxing|muay\s*thai|kickboxing|bjj|sparring|run|ran|km)\b/i,
];

const score = (text: string, patterns: readonly RegExp[]) =>
  patterns.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);

export function routeMessage(text: string): Route {
  const finance = score(text, FINANCE);
  const fitness = score(text, FITNESS);
  if (finance > 0 && fitness > 0) return { module: null, reason: 'mixed' };
  if (finance > 0) return { module: 'finance' };
  if (fitness > 0) return { module: 'fitness' };
  return { module: null, reason: 'unclear' };
}
