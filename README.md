# Life OS

Personal command centre for money and training. **Finance** and **Fitness** are
independent, first-class modules over a shared shell, identity and assistant.

Built for one person today, architected for many from day one.

> Product source of truth: [`docs/PRD.md`](./docs/PRD.md).
> Decisions and their reasons: [`docs/PRODUCT_DECISIONS.md`](./docs/PRODUCT_DECISIONS.md).

## Status — Phase 0

Rails only. The shell renders, the engines are real and tested, and the
database has its primitives. There is no persistence yet.

| Delivered | |
|---|---|
| pnpm monorepo, TypeScript strict | ✅ |
| Expo Router shell — 5 tabs, web + Android from one tree | ✅ |
| `finance-core` money engine — integer paise | ✅ 71 tests |
| `fitness-core` measures engine — integer grams/seconds/metres | ✅ 25 tests |
| Module boundary enforcement in CI | ✅ with verification probes |
| Migration `0001` — money and measure domains | ✅ |
| CI — lint, typecheck, test, web bundle | ✅ |

Not yet: auth, tables, RLS, transactions, budgets, wealth, workouts, AI.
See the phase table in [`docs/TECHNICAL_ARCHITECTURE.md`](./docs/TECHNICAL_ARCHITECTURE.md).

## Quick start

```bash
pnpm install
pnpm -r test        # 96 invariant tests
pnpm -r typecheck
pnpm lint           # includes module boundary rules
pnpm mobile:web     # run in a browser
pnpm mobile:android # run on a device or emulator
```

Supabase is not yet linked — that needs your project credentials. Once linked:

```bash
pnpm db:push        # apply migrations
pnpm db:test        # pgTAP (from Phase 1)
```

## The two rules that shape everything

**1. No floating point for authoritative figures.**

Money is integer **paise**; weights are integer **grams**. ₹0.01 has no exact
binary floating-point representation, so float rupees drift over any realistic
number of transactions — and training volume, being a sum of (weight × reps)
over thousands of sets with fractional-kilogram plates, drifts the same way.
Both have database domains so the constraint travels with the column.

**2. Finance is double-entry.**

A transaction is a header plus 2+ postings constrained to sum to zero. This
turns the PRD's accounting invariants from conventions into structural facts:

- a transfer posts asset→asset, so it has **no expense leg** and cannot count as spending
- a card repayment posts liability→asset, so it has **no expense leg** and cannot double-count expenditure
- unrealized gains are never posted at all, so they cannot masquerade as income

No table stores a balance. Balances, budget utilisation and net worth all derive
from postings, so editing or deleting a transaction has nothing to recalculate
and nothing that can fall out of agreement with the records.

## Layout

```
apps/mobile            Expo Router app — Android (priority) + Web
packages/finance-core  double-entry engine, budgets, lots, valuation, net worth
packages/fitness-core  volume, progression, personal records, consistency
supabase/migrations    ordered schema changes
supabase/tests         pgTAP — RLS and cross-user isolation
docs/                  PRD, architecture, schema, decisions
```

`finance-core` and `fitness-core` are pure: no I/O, no React, no Supabase, and
they never import each other. That last one is how the requirement that a
fitness request cannot reach financial data becomes a build failure rather than
a policy.
