// Assistant Edge Function: the only place a provider credential is used.
//
// It routes the message to one module and, when a real provider is enabled,
// asks the model for a structured proposal. It never writes data and never
// validates on the model's word: the app validates every proposal with
// @life-os/ai-core and saves only what the user confirms, through
// confirm_ai_draft / post_transaction.
//
// Data minimisation: the model receives the message and the user's own
// category names. No balances, history or account details.
//
// Secrets:
//   AI_PROVIDER      "gemini" to call Gemini; anything else (default) → stub.
//                    Keep "stub" until the key's project has Cloud Billing:
//                    Google may use and human-review free-tier content.
//   GEMINI_API_KEY   the key; never sent to the client.
//   GEMINI_MODEL     defaults to gemini-3.5-flash-lite (stable, Nov 2026).

import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  buildInteractionRequest,
  GEMINI_INTERACTIONS_URL,
  readInteraction,
} from '../../../packages/ai-core/src/gemini.ts';
import {
  EXPENSE_SYSTEM_INSTRUCTION,
  expenseProposalSchema,
} from '../../../packages/ai-core/src/finance/proposal.ts';
import { routeMessage } from '../../../packages/ai-core/src/router.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_INPUT = 1000;
const PROVIDER_TIMEOUT_MS = 15_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // The caller's own JWT: every read below goes through their RLS.
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { error: 'not_authenticated' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'not_authenticated' });

  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof text !== 'string' || text.trim().length === 0 || text.length > MAX_INPUT) {
    return json(400, { error: 'bad_request', detail: `Send 1 to ${MAX_INPUT} characters of text.` });
  }

  const route = routeMessage(text);
  if (route.module !== 'finance') {
    // Only finance tools exist so far. Nothing is sent to a provider.
    return json(200, { route, engine: null });
  }

  if (Deno.env.get('AI_PROVIDER') !== 'gemini') {
    return json(200, { route, engine: 'stub' });
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json(503, { error: 'provider_not_configured' });
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite';

  const { data: categories, error: catError } = await supabase
    .from('ledger_accounts')
    .select('name')
    .eq('account_class', 'EXPENSE')
    .order('name');
  if (catError) return json(500, { error: 'categories_unavailable' });
  const names = (categories ?? []).map((c: { name: string }) => c.name);

  const body = buildInteractionRequest({
    model,
    systemInstruction: EXPENSE_SYSTEM_INSTRUCTION,
    input: text,
    schema: expenseProposalSchema(names),
  });

  let response: Response;
  try {
    response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    return json(502, { route, engine: 'gemini', model, error: 'provider_unreachable' });
  }

  if (!response.ok) {
    // Status only: provider error bodies can echo the request.
    console.error(`gemini error ${response.status}`);
    return json(502, { route, engine: 'gemini', model, error: 'provider_error', status: response.status });
  }

  const result = readInteraction(await response.json().catch(() => null));
  if (!result.ok) {
    return json(200, { route, engine: 'gemini', model, error: result.reason, detail: result.detail });
  }

  return json(200, { route, engine: 'gemini', model, proposal: result.json });
});
