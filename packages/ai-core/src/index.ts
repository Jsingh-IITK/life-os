/**
 * @life-os/ai-core — the assistant's deterministic half.
 *
 * Contract: no I/O and no provider SDK. Models only propose; this package
 * routes a message to ONE module, defines what may be proposed, and
 * validates every proposal as untrusted input. Arithmetic stays in the
 * module engines. Module isolation is enforced by eslint: finance/ cannot
 * import fitness-core, and the shared files import neither.
 */

export * as Router from './router';
export * as FinanceAssistant from './finance/index';
export * as Gemini from './gemini';
