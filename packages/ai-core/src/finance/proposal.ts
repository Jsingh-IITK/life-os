/**
 * What a model (or the stub) may propose for an expense.
 *
 * The model does no arithmetic: `amount_text` is the amount exactly as the
 * user wrote it, and finance-core parses it. Dates are words or calendar
 * dates; code resolves them against the user's today. Every field is
 * untrusted until `validateExpenseProposal` has checked it.
 */

export const PAYMENT_METHODS = ['upi', 'credit_card', 'debit_card', 'cash', 'bank_transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface ExpenseProposal {
  intent: 'record_expense' | 'unsupported';
  amount_text: string | null;
  /** "today", "yesterday", or YYYY-MM-DD. Null when not stated. */
  date: string | null;
  merchant: string | null;
  /** One of the user's own category names, or null. */
  category: string | null;
  /** Only when the user stated it. Never inferred. */
  payment_method: PaymentMethod | null;
  description: string | null;
}

/**
 * JSON Schema handed to the model as its structured-output contract.
 * `categories` is the user's own list, so the model cannot invent one.
 */
export function expenseProposalSchema(categories: readonly string[]): Record<string, unknown> {
  const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
  return {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['record_expense', 'unsupported'],
        description: 'record_expense only if the user describes money they spent.',
      },
      amount_text: nullable({
        type: 'string',
        description:
          'The amount exactly as the user wrote it, e.g. "300", "1.5k", "₹2,000". Never calculate or convert.',
      }),
      date: nullable({
        type: 'string',
        description: '"today", "yesterday", or YYYY-MM-DD. Null if the user did not say.',
      }),
      merchant: nullable({ type: 'string', description: 'Shop, app or person paid, if named.' }),
      category: nullable(
        categories.length > 0
          ? { type: 'string', enum: [...categories], description: 'Closest of the user\'s categories, or null.' }
          : { type: 'string' },
      ),
      payment_method: nullable({
        type: 'string',
        enum: [...PAYMENT_METHODS],
        description: 'Only if the user said how they paid. Otherwise null.',
      }),
      description: nullable({ type: 'string', description: 'A few words on what it was for.' }),
    },
    required: ['intent', 'amount_text', 'date', 'merchant', 'category', 'payment_method', 'description'],
  };
}

export const EXPENSE_SYSTEM_INSTRUCTION = [
  'You turn one message about personal spending into a JSON draft for an expense tracker in India.',
  'Messages may be English, Hindi in Latin script (Hinglish), or a mix.',
  'Copy the amount exactly as written into amount_text. Never add, convert or calculate.',
  'Leave a field null when the message does not say it. Do not guess the payment method or the date.',
  'Use only the category names you are given. If none fits, use null.',
  'If the message is not about money spent, set intent to "unsupported" and every other field to null.',
].join(' ');
