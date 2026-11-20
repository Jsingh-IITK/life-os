/**
 * Guards pgTAP plan counts against the assertions actually written.
 *
 * A plan that disagrees with reality fails the whole suite even when every
 * assertion passes, and the failure reads as a test failure rather than a
 * bookkeeping slip. This has happened three times; checking it locally is
 * faster than finding out from CI.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/tests';
let bad = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(DIR, file), 'utf8');

  const planned = Number(/select plan\((\d+)\)/.exec(sql)?.[1] ?? NaN);
  // Top-level assertions only: those beginning a statement. Calls nested
  // inside a dollar-quoted body are arguments, not assertions.
  const actual = (sql.match(/^select (ok|is|isnt|throws_ok|lives_ok)\(/gm) ?? []).length;

  const status = planned === actual ? 'ok  ' : 'FAIL';
  if (planned !== actual) bad++;
  console.log(`${status} ${file}: planned ${planned}, found ${actual}`);
}

if (bad > 0) {
  console.error(`\n${bad} suite(s) have a plan that does not match their assertions`);
  process.exit(1);
}
console.log('\nall plan counts match');
