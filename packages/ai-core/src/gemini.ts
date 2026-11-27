/**
 * Gemini Interactions API: request building and response reading.
 *
 * NO IMPORTS, deliberately. The Supabase Edge Function (Deno) imports this
 * file directly, and Deno cannot resolve the extensionless relative imports
 * the rest of the workspace uses for Metro. Keeping it dependency-free lets
 * one tested implementation serve both.
 *
 * API shape per Google's docs, read 2026-11-27:
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   header x-goog-api-key
 *   body { model, input, system_instruction, response_format: { type: "text",
 *          mime_type: "application/json", schema } }
 *   response: Interaction { status, steps: [{ type: "model_output",
 *          content: [{ type: "text", text }] }], errors: [{ code, message }] }
 * generateContent is documented as legacy; Interactions is recommended.
 */

export const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export interface InteractionRequest {
  readonly model: string;
  readonly input: string;
  readonly system_instruction: string;
  readonly response_format: {
    readonly type: 'text';
    readonly mime_type: 'application/json';
    readonly schema: Record<string, unknown>;
  };
}

export function buildInteractionRequest(args: {
  model: string;
  systemInstruction: string;
  input: string;
  schema: Record<string, unknown>;
}): InteractionRequest {
  if (!args.model.trim()) throw new Error('buildInteractionRequest: model is required');
  return {
    model: args.model,
    input: args.input,
    system_instruction: args.systemInstruction,
    response_format: { type: 'text', mime_type: 'application/json', schema: args.schema },
  };
}

export type InteractionResult =
  | { readonly ok: true; readonly json: unknown }
  | { readonly ok: false; readonly reason: 'failed' | 'incomplete' | 'no_output' | 'not_json'; readonly detail: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Reads the model's JSON out of an Interaction resource. Never throws. */
export function readInteraction(body: unknown): InteractionResult {
  if (!isRecord(body)) return { ok: false, reason: 'no_output', detail: 'Response was not an object.' };

  const errors = Array.isArray(body.errors) ? body.errors : [];
  if (body.status === 'failed' || errors.length > 0) {
    const first = errors.find(isRecord);
    return {
      ok: false,
      reason: 'failed',
      detail: typeof first?.message === 'string' ? first.message : 'The interaction failed.',
    };
  }
  // Truncated output (e.g. max tokens) cannot be trusted to be complete JSON.
  if (body.status === 'incomplete') {
    return { ok: false, reason: 'incomplete', detail: 'The model stopped before finishing.' };
  }

  const steps = Array.isArray(body.steps) ? body.steps : [];
  const text = steps
    .filter((s): s is Record<string, unknown> => isRecord(s) && s.type === 'model_output')
    .flatMap((s) => (Array.isArray(s.content) ? s.content : []))
    .filter((c): c is Record<string, unknown> => isRecord(c) && c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('');

  if (!text.trim()) return { ok: false, reason: 'no_output', detail: 'The model returned no text.' };

  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, reason: 'not_json', detail: 'The model did not return valid JSON.' };
  }
}
