/**
 * @life-os/fitness-core - deterministic fitness engine.
 *
 * Contract: no I/O, no Supabase, no React. It also never imports
 * @life-os/finance-core; the module boundary in the PRD's security rules is
 * enforced at build time, not by convention.
 */

export * as Measures from './measures/index';
export * as Records from './records/index';
export * as Progression from './progression/index';
export type { Grams, Metres, Reps, Seconds } from './measures/units';
