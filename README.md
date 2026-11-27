# Life OS

Personal command centre for money and training. **Finance** and **Fitness** are
independent, first-class modules over a shared shell, identity and assistant.

Built for one person today, architected for many from day one.

> Product source of truth: [`docs/PRD.md`](./docs/PRD.md).
> Decisions and their reasons: [`docs/PRODUCT_DECISIONS.md`](./docs/PRODUCT_DECISIONS.md).

## Status — Finance core done, Fitness in progress

Phases 0–2 are delivered, and Phase 5 (Fitness) has its schema and session
lifecycle. Last updated 2026-11-21.

| Area | State |
|---|---|
| Shell — Expo Router, 5 tabs, web + Android, light/dark | ✅ |
| Auth — sign-up, sign-in, password reset | ✅ |
| Double-entry ledger — record, edit, delete, restore, audited | ✅ |
| Accounts, categories, card payments, paginated history | ✅ |
| Monthly budgets, planned vs actual | ✅ |
| Home with real month figures | ✅ |
| RLS + grants + composite FKs on every user table, `audit_rls()` | ✅ |
| Fitness schema, analytics views, seeded programme | ✅ database only |
| Workout session start/complete (`0015`), plan versions and skips (`0016`) | ✅ database, local and hosted |
| PRs, progression, consistency (missed is derived) | ✅ `fitness-core`, not yet wired to UI |
| Fitness UI | ⏳ paused, core features first |
| Finance wealth — lots, valuations, net worth (Phase 3) | ⏳ not started |
| Assistant: expense drafts from English/Hinglish (Phase 4) | ✅ stub engine live; Gemini wired, off until billing is confirmed |

Tests: `finance-core` 119, `fitness-core` 89, pgTAP 152 across 10 files,
26 browser smoke assertions (sign-in currently fails against the hosted
project: its QA account does not exist there).

See the phase table in [`docs/TECHNICAL_ARCHITECTURE.md`](./docs/TECHNICAL_ARCHITECTURE.md).

## Quick start

```bash
pnpm install
pnpm -r test        # engine invariant tests
pnpm -r typecheck
pnpm lint           # includes module boundary rules
pnpm mobile:web     # run in a browser
pnpm mobile:android # run on a device or emulator
pnpm smoke          # scripted browser assertions
```

The app reads `EXPO_PUBLIC_SUPABASE_URL` and the anon key from
`apps/mobile/.env` (template: `.env.example`).

Database work runs against a local Supabase stack, which needs a container
runtime (Docker Desktop, OrbStack or colima):

```bash
npx supabase db start         # Postgres only; enough for tests
npx supabase db reset --local # apply every migration from scratch
pnpm db:test                  # pgTAP
pnpm db:push                  # apply migrations to the hosted project (--remote)
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
packages/finance-core  money, posting builders, budget status (lots, valuation, net worth planned)
packages/fitness-core  measures, volume, personal records, progression, consistency
supabase/migrations    ordered schema changes
supabase/tests         pgTAP — RLS and cross-user isolation
docs/                  PRD, architecture, schema, decisions
```

`finance-core` and `fitness-core` are pure: no I/O, no React, no Supabase, and
they never import each other. That last one is how the requirement that a
fitness request cannot reach financial data becomes a build failure rather than
a policy.
