# Life OS — working notes for Claude Code

Personal Life OS: one app for money and training. **Finance** and **Fitness** are
first-class, independent modules over a shared shell, identity and assistant.
Habits and Journal are future modules — do not build them.

Product source of truth: `docs/PRD.md` (Personal Life OS Handoff v3.0).
Architecture decisions and their reasons: `docs/PRODUCT_DECISIONS.md`.

## Non-negotiable rules

1. **Never use floating point for authoritative money or training totals.**
   Money is integer **paise** (`@life-os/finance-core` `Money`). Weights are
   integer **grams**, durations **seconds**, distances **metres**
   (`@life-os/fitness-core` `Measures`). The database enforces this through the
   `paise`/`grams`/`seconds`/`metres` domains.
2. **Finance uses double-entry.** A transaction is a header plus 2+ postings that
   must sum to zero. This is what makes the accounting invariants structural: a
   transfer has no expense leg, so it *cannot* count as spending; a card
   repayment has no expense leg, so it *cannot* double-count expenditure.
3. **The core engines are pure.** `finance-core` and `fitness-core` do no I/O,
   import no Supabase, no React, no Node builtins, and never import each other.
   Enforced by `eslint.config.mjs` — a violation fails the build.
4. **RLS before data.** Every user-owned table gets RLS with ownership checks on
   `UPDATE` in **both** `USING` and `WITH CHECK`, plus composite foreign keys
   including `user_id` so cross-user references fail inside the database.
   FK checks run as the table owner and bypass RLS — RLS alone is not enough.
5. **AI interprets; code decides.** The assistant proposes validated drafts.
   It performs no arithmetic, holds no credentials client-side, and gets only
   its own module's tools. There is no raw SQL tool.
6. **A `SECURITY INVOKER` function in `public` must not call `app_private`.**
   `authenticated` has no `USAGE` on that schema, so the call fails with
   *permission denied* for every real user — while tests that run as a
   privileged role still pass. Helpers needed by invoker functions belong in
   `public`, where `SECURITY INVOKER` keeps them safe: they read through the
   caller's own RLS. This has bitten twice.
7. **RLS is not a grant.** A table needs `GRANT` as well as policies, or every
   query fails with *permission denied for table*. The local Supabase stack
   grants by default and the hosted project does not, so this passes locally
   and fails in production. `audit_rls()` now checks for it.
8. **Never hardcode financial assumptions.** Seed figures belong to one user's
   account, never to table defaults or migration literals.

## Layout

```
apps/mobile          Expo Router app — Android (priority) + Web from one tree
packages/finance-core  double-entry engine, budgets, lots, valuation, net worth
packages/fitness-core  volume, progression, PRs, consistency
supabase/migrations    ordered schema changes
supabase/tests         pgTAP — RLS and cross-user isolation
docs/                  PRD and architecture records
```

## Commands

```bash
pnpm install
pnpm -r typecheck
pnpm -r test            # financial + training invariants
pnpm lint               # includes module boundary enforcement
pnpm mobile:web         # run on web
pnpm mobile:android     # run on Android
```

## Toolchain notes

- **TypeScript is pinned to 6.0.3**, not 7.x. Expo 58 validates its types
  against TS 6; TS 7 is the native port and only 7.0.2 is stable. Revisit once
  Expo supports it.
- **Relative imports inside packages must be extensionless** (`./money/index`,
  not `./money/index.js`). Metro cannot resolve the `.js`-in-TS-source ESM
  convention, even though Node and Vitest accept it.
- Weights/measures and money both have database domains; prefer them over raw
  `bigint` so the constraint travels with the column.

## Working agreement

- Small increments. Explain intended changes, implement, run tests, report what
  is actually done — including what is not.
- A feature is not complete because its UI exists.
- Do not mark an invariant satisfied without a test that would fail if it broke.
