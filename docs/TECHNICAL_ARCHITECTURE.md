# Technical architecture

## Stack

| Layer | Choice |
|---|---|
| Client | Expo 58, React Native 0.88, Expo Router — Android (priority) + Expo Web from one tree |
| Language | TypeScript 6.0.3, strict (see [D10](./PRODUCT_DECISIONS.md)) |
| Backend | Supabase — PostgreSQL, Auth, RLS, Edge Functions |
| Client state | TanStack Query (server state); React state for the rest. Zustand and Zod are not installed: add them when a real need appears, not ahead of it. |
| Tests | Vitest (engines), pgTAP (RLS and database), Playwright smoke (`pnpm smoke`) |
| Shape | Modular monolith. No microservices. |

## Layout

As built. Directories marked *planned* do not exist yet.

```
apps/mobile/
  app/(tabs)/             home, finance, fitness, assistant, settings
  app/(auth)/             sign-in, sign-up, forgot-password
  app/                    transactions, transaction/new, transaction/[id], budget, accounts
  components/ui/          design system primitives (Card, Button, Input, ListRow, …)
  components/finance/     finance-specific composites
  components/nav/         sidebar / tab chrome
  design/                 tokens.ts, theme.tsx (light/dark/system)
  lib/auth/               session provider, auth error mapping
  lib/queries/            TanStack Query hooks per domain — no arithmetic
packages/
  finance-core/           money (paise), posting builders, budget status
  fitness-core/           measures, volume, records (PRs), progression, consistency
  ai-core/                routing, proposal schemas, stub, validation, Gemini adapter
supabase/
  migrations/             0001–0016
  tests/                  pgTAP, 001–010
scripts/                  smoke.mjs, check-plans.mjs, ci.sh
docs/
```

Planned, not yet created: `finance-core` lots, valuation and net worth
(Phase 3);
`supabase/functions/` and an AI package for the assistant (Phase 4). Earlier
drafts of this document listed `ai-core`, `shared-types`, `shared-validation`
and `ui` packages; none were created, and UI primitives live in
`apps/mobile/components/ui` instead.

## Enforced boundaries

Not conventions — build failures. See `eslint.config.mjs` and
[D9](./PRODUCT_DECISIONS.md).

- `apps/*` performs no financial or training arithmetic; it calls the engines.
  (A convention checked in review, not a lint rule.)
- `finance-core` and `fitness-core` import no Supabase, React, or Node builtins.
- **`fitness-core` and `finance-core` never import each other.** This is how the
  PRD's rule that a fitness request cannot reach financial data becomes
  structural.
- AI provider SDKs are banned from `apps/*` — a provider SDK in the client
  bundle means a credential in the client bundle.

The boundary rules have verification probes: deliberately-violating files are
linted to confirm each rule actually rejects, because an earlier config version
silently disabled one (flat config replaces same-named rules rather than merging
their options).

## Determinism contract

Core engine functions take explicit, user-scoped inputs and return deterministic
outputs. No global mutable state, no ambient user context, no clock reads inside
calculations — a date is a parameter. This is what allows every accounting and
training invariant to be a unit test rather than a manual check.

## Data flow for a financial write

```
UI → finance-core parses amounts and builds balanced postings
   → post_transaction(jsonb) RPC  ← single server-side transaction
   → deferred constraint trigger asserts postings sum to zero
   → balances/budgets derive on read; nothing to recalculate
```

The RPC is required, not stylistic: the Supabase client cannot open a
multi-statement transaction, so inserting legs individually would permit a
half-written, unbalanced transaction to exist.

## Why derived balances

No table stores a balance. Account balances, budget utilisation and net worth
are all computed from postings. The PRD requires that editing or deleting a
transaction recalculates dependent metrics; with derived figures there is
nothing to recalculate and therefore nothing that can drift out of agreement
with the underlying records.

CI asserts the two integrity properties directly: every transaction's postings
sum to zero, and every derived balance equals the sum of its postings.

## AI architecture

```
user text → router picks ONE module
          → only that module's typed tools are exposed
          → model returns a structured proposal
          → schema-validated as untrusted input
          → domain service executes; deterministic code does all arithmetic
          → ai_action_logs records proposal + execution
```

No raw SQL tool exists. Writes are drafts requiring confirmation; destructive
actions require explicit confirmation. Provider credentials live only in Edge
Function secrets.

## Performance posture

Indexes on `user_id` plus composites matching real access paths; keyset
pagination rather than `OFFSET`; aggregate queries rather than loading history
into memory. Deliberately *not* doing: background jobs, caching layers,
analytics pipelines, or dedicated services — those arrive when measured usage
justifies them.

## Phases

| Phase | Delivers | State (2026-11-21) |
|---|---|---|
| 0 | Repo, workspace, shell, money/measure primitives, CI, docs | ✅ |
| 1 | Auth, profiles, preferences, chart of accounts, transactions + postings, **RLS + pgTAP**, design system, AI interface + stub | ✅ except the AI interface/stub |
| 2 | Finance core — accounts, all transaction types, history, budgets, dashboard | ✅ |
| 3 | Finance wealth — five asset classes, FIFO lots, valuations, emergency fund, net worth, XIRR | ⏳ not started |
| 4 | Finance conversational AI — provider selection gate, finance tools | 🟡 Gemini chosen; expense drafts via stub (Gemini off until paid tier) |
| 5 | Fitness MVP — library, plans, templates, diary, fitness tools | 🟡 schema, plan versions, skips, session lifecycle; PRs, progression, consistency in `fitness-core`; no UI |
| 6 | Advanced analytics, cross-module dashboard; Habits/Journal only once stable | ⏳ |
