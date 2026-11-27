/**
 * Fills in what a validated draft did not say, so the user only has to
 * glance and save.
 *
 * Category, in order of trust:
 *   1. history  — the category the user chose before for this merchant, or
 *                 for this item ("lunch"), most frequent then most recent
 *   2. proposal — what the model or stub suggested (already validated)
 *   3. fallback — the user's catch-all category, if they have one
 *
 * Account: the card named when the user said "credit card", otherwise the
 * user's default account. Every pick carries its source so the screen can
 * say why, and the user can still change it before saving.
 */

import type { ExpenseDraft } from './validate';

export type CategorySource = 'history' | 'proposal' | 'fallback';
export type AccountSource = 'default' | 'recent_card' | 'only_card';

export interface PastExpense {
  readonly merchant: string | null;
  readonly description: string | null;
  readonly categoryId: string;
  /** YYYY-MM-DD; breaks frequency ties toward the most recent. */
  readonly date: string;
}

export interface AccountRef {
  readonly id: string;
  readonly kind: 'asset' | 'card';
  readonly isDefault: boolean;
}

export interface CompletedDraft extends ExpenseDraft {
  readonly categorySource: CategorySource | null;
  readonly accountId: string | null;
  readonly accountSource: AccountSource | null;
}

/** Names that mean "everything else", best first. */
const CATCH_ALL = ['misc', 'other', 'general', 'buffer', 'uncategor'];

const norm = (s: string | null) => (s ?? '').trim().toLowerCase();

function fromHistory(
  key: string,
  field: 'merchant' | 'description',
  history: readonly PastExpense[],
  validIds: ReadonlySet<string>,
): string | null {
  if (!key) return null;
  const tally = new Map<string, { count: number; latest: string }>();
  for (const h of history) {
    if (norm(h[field]) !== key || !validIds.has(h.categoryId)) continue;
    const t = tally.get(h.categoryId) ?? { count: 0, latest: '' };
    t.count += 1;
    if (h.date > t.latest) t.latest = h.date;
    tally.set(h.categoryId, t);
  }
  let best: string | null = null;
  let bestT = { count: 0, latest: '' };
  for (const [id, t] of tally) {
    if (t.count > bestT.count || (t.count === bestT.count && t.latest > bestT.latest)) {
      best = id;
      bestT = t;
    }
  }
  return best;
}

export function completeDraft(
  draft: ExpenseDraft,
  context: {
    readonly categories: readonly { id: string; name: string }[];
    readonly history: readonly PastExpense[];
    readonly accounts: readonly AccountRef[];
    /** Card used most recently for a purchase, if any. */
    readonly recentCardId: string | null;
  },
): CompletedDraft {
  const validIds = new Set(context.categories.map((c) => c.id));
  const nameOf = (id: string) => context.categories.find((c) => c.id === id)?.name ?? null;

  let categoryId: string | null = null;
  let categorySource: CategorySource | null = null;

  const learned =
    fromHistory(norm(draft.merchant), 'merchant', context.history, validIds) ??
    fromHistory(norm(draft.description), 'description', context.history, validIds);

  if (learned) {
    categoryId = learned;
    categorySource = 'history';
  } else if (draft.categoryId && validIds.has(draft.categoryId)) {
    categoryId = draft.categoryId;
    categorySource = 'proposal';
  } else {
    for (const word of CATCH_ALL) {
      const hit = context.categories.find((c) => c.name.toLowerCase().includes(word));
      if (hit) {
        categoryId = hit.id;
        categorySource = 'fallback';
        break;
      }
    }
  }

  const cards = context.accounts.filter((a) => a.kind === 'card');
  const assets = context.accounts.filter((a) => a.kind === 'asset');
  let accountId: string | null = null;
  let accountSource: AccountSource | null = null;

  if (draft.paymentMethod === 'credit_card') {
    // The user said card. Use the card they use; with one card, that one.
    if (context.recentCardId && cards.some((c) => c.id === context.recentCardId)) {
      accountId = context.recentCardId;
      accountSource = 'recent_card';
    } else if (cards.length === 1) {
      accountId = cards[0]!.id;
      accountSource = 'only_card';
    }
  } else if (draft.paymentMethod !== 'cash') {
    // UPI, debit, bank transfer or not stated: the default account. Cash is
    // left to the user, so cash spending never reads as leaving the bank.
    // A default that is a card is used only when the user said nothing.
    const fallbackDefault = context.accounts.find((a) => a.isDefault);
    const assetDefault = assets.find((a) => a.isDefault);
    const pick =
      draft.paymentMethod === null ? fallbackDefault : (assetDefault ?? null);
    if (pick) {
      accountId = pick.id;
      accountSource = 'default';
    }
  }

  return {
    ...draft,
    categoryId,
    categoryName: categoryId ? nameOf(categoryId) : null,
    missing: categoryId ? [] : ['category'],
    categorySource,
    accountId,
    accountSource,
  };
}
