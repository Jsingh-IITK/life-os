import { FinanceAssistant, type Router } from '@life-os/ai-core';
import { type Money, Postings } from '@life-os/finance-core';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/lib/auth/session';
import { localDateISO } from '@/lib/queries/fitness';
import { ledgerCaches } from '@/lib/queries/keys';
import { supabase } from '@/lib/supabase';

/**
 * The assistant, client side.
 *
 * 1. The Edge Function routes the message and says which engine applies.
 *    With Gemini enabled it returns the model's raw proposal; otherwise the
 *    deterministic stub runs here.
 * 2. Every proposal is validated by ai-core as untrusted input.
 * 3. The proposal and its validation outcome are logged (ai_action_logs).
 * 4. Nothing is saved until the user confirms; confirm_ai_draft then posts
 *    through the normal write path, atomically with the log.
 */

export type Engine = 'stub' | 'gemini';

export type AssistantReply =
  | { kind: 'draft'; logId: string; engine: Engine; model: string | null; draft: FinanceAssistant.ExpenseDraft }
  | { kind: 'invalid'; engine: Engine; detail: string }
  | { kind: 'unsupported'; detail: string }
  | { kind: 'error'; detail: string };

interface FunctionReply {
  route?: Router.Route;
  engine?: Engine | null;
  model?: string;
  proposal?: unknown;
  error?: string;
  detail?: string;
}

const ROUTE_MESSAGES: Record<string, string> = {
  fitness: 'Logging workouts by message is not built yet. Use the Fitness tab for now.',
  mixed: 'That mentions both money and training. Send them as two messages.',
  unclear: 'I can record an expense, for example "spent 300 on lunch via UPI" or "chai pe 40 gaye".',
};

export function useAssistantPropose(categories: readonly FinanceAssistant.CategoryRef[]) {
  const userId = useUserId();

  return useMutation({
    mutationFn: async (text: string): Promise<AssistantReply> => {
      if (!userId) throw new Error('not signed in');
      const trimmed = text.trim();

      const { data, error } = await supabase.functions.invoke<FunctionReply>('assistant', {
        body: { text: trimmed },
      });
      if (error) return { kind: 'error', detail: 'The assistant is unavailable right now. Try again shortly.' };
      const reply = data ?? {};

      if (!reply.engine) {
        const key = reply.route?.module ?? (reply.route && 'reason' in reply.route ? reply.route.reason : 'unclear');
        return { kind: 'unsupported', detail: ROUTE_MESSAGES[key ?? 'unclear'] ?? ROUTE_MESSAGES.unclear! };
      }

      if (reply.engine === 'gemini' && reply.error) {
        return { kind: 'error', detail: 'The model could not read that. Try rephrasing, or add it manually.' };
      }

      const engine = reply.engine;
      const proposal =
        engine === 'gemini'
          ? reply.proposal
          : FinanceAssistant.stubExpenseProposal(trimmed, categories.map((c) => c.name));

      const result = FinanceAssistant.validateExpenseProposal(proposal, {
        categories,
        today: localDateISO(),
      });

      const { data: log, error: logError } = await supabase
        .from('ai_action_logs')
        .insert({
          user_id: userId,
          module: 'finance',
          engine,
          model: engine === 'gemini' ? (reply.model ?? null) : null,
          input_text: trimmed,
          proposal: proposal ?? null,
          outcome: result.ok ? 'proposed' : 'invalid',
          invalid_reason: result.ok ? null : result.reason,
        })
        .select('id')
        .single();
      if (logError) throw new Error(logError.message);

      if (!result.ok) {
        return result.reason === 'unsupported'
          ? { kind: 'unsupported', detail: ROUTE_MESSAGES.unclear! }
          : { kind: 'invalid', engine, detail: result.detail };
      }

      return {
        kind: 'draft',
        logId: log.id as string,
        engine,
        model: engine === 'gemini' ? (reply.model ?? null) : null,
        draft: result.draft,
      };
    },
  });
}

export interface ConfirmInput {
  logId: string;
  draft: FinanceAssistant.ExpenseDraft;
  categoryId: string;
  /** Asset account it was paid from, or the card it was charged to. */
  accountId: string;
  isCard: boolean;
}

export function useConfirmDraft() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async ({ logId, draft, categoryId, accountId, isCard }: ConfirmInput) => {
      const amount: Money.Paise = draft.amount;
      // A card purchase raises the liability; paying the card later settles
      // it without double-counting. Same rule as manual entry.
      const input: Postings.TransactionInput = isCard
        ? { type: 'cc_purchase', amount, categoryAccountId: categoryId, cardAccountId: accountId }
        : { type: 'expense', amount, categoryAccountId: categoryId, paidFromAccountId: accountId };
      const legs = Postings.buildPostings(input);

      const { data, error } = await supabase.rpc('confirm_ai_draft', {
        p_log_id: logId,
        p_transaction: {
          txn_date: draft.date,
          type: input.type,
          description: draft.description,
          merchant: draft.merchant,
          payment_method: draft.paymentMethod,
          postings: Postings.toRpcPostings(legs),
        },
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      if (!userId) return;
      for (const key of ledgerCaches(userId)) void client.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDismissDraft() {
  return useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase
        .from('ai_action_logs')
        .update({ outcome: 'dismissed', decided_at: new Date().toISOString() })
        .eq('id', logId);
      if (error) throw new Error(error.message);
    },
  });
}
