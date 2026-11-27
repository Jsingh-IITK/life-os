import { describe, expect, it } from 'vitest';

import { buildInteractionRequest, readInteraction } from './gemini';
import { routeMessage } from './router';

describe('routing picks exactly one module', () => {
  it('routes spending to finance', () => {
    expect(routeMessage('spent 300 on lunch')).toEqual({ module: 'finance' });
    expect(routeMessage('chai pe 40 gaye')).toEqual({ module: 'finance' });
  });

  it('routes training to fitness', () => {
    expect(routeMessage('bench 60kg x 8')).toEqual({ module: 'fitness' });
  });

  it('refuses a message that touches both, rather than mixing data', () => {
    expect(routeMessage('paid 500 for gym and did bench 60kg x 8')).toEqual({ module: null, reason: 'mixed' });
  });

  it('refuses what it cannot place', () => {
    expect(routeMessage('hello there')).toEqual({ module: null, reason: 'unclear' });
  });
});

describe('Gemini Interactions adapter', () => {
  it('builds the documented request shape', () => {
    const body = buildInteractionRequest({
      model: 'gemini-x',
      systemInstruction: 'sys',
      input: 'spent 300',
      schema: { type: 'object' },
    });
    expect(body).toEqual({
      model: 'gemini-x',
      input: 'spent 300',
      system_instruction: 'sys',
      response_format: { type: 'text', mime_type: 'application/json', schema: { type: 'object' } },
    });
  });

  it('reads JSON from model_output text steps', () => {
    const r = readInteraction({
      status: 'completed',
      steps: [
        { type: 'user_input', content: [{ type: 'text', text: 'ignored' }] },
        { type: 'model_output', content: [{ type: 'text', text: '{"intent":' }, { type: 'text', text: '"unsupported"}' }] },
      ],
    });
    expect(r).toEqual({ ok: true, json: { intent: 'unsupported' } });
  });

  it('reports failures, truncation and junk without throwing', () => {
    expect(readInteraction({ status: 'failed', errors: [{ code: 'x', message: 'quota' }] })).toMatchObject({
      ok: false,
      reason: 'failed',
      detail: 'quota',
    });
    expect(readInteraction({ status: 'incomplete', steps: [] })).toMatchObject({ ok: false, reason: 'incomplete' });
    expect(readInteraction({ steps: [] })).toMatchObject({ ok: false, reason: 'no_output' });
    expect(
      readInteraction({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Sure! Here you go' }] }] }),
    ).toMatchObject({ ok: false, reason: 'not_json' });
    expect(readInteraction('nope')).toMatchObject({ ok: false, reason: 'no_output' });
  });
});
