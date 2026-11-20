# API contracts

**Status:** placeholder. Contracts are defined in Phase 1 (RPC + Edge Function
skeleton) and filled in as each phase lands. Schemas live in
`packages/shared-validation` so one definition serves the client, the Edge
Functions and AI output validation.

## Planned surfaces

### Database RPC

| Function | Phase | Notes |
|---|---|---|
| `post_transaction(payload jsonb)` | 1 | The only write path for transactions. Inserts header + balanced legs in one server-side transaction, because the Supabase client cannot open a multi-statement transaction. |
| `log_workout_session(payload jsonb)` | 5 | Session + exercises + sets atomically, with template values snapshotted. |

### Edge Functions

| Function | Phase | Notes |
|---|---|---|
| `ai-extract` | 4 | Natural language → structured draft. Returns a proposal; never writes. |
| `ai-chat` | 4 | Grounded Q&A over the caller's own data. |

Both build their Supabase client from the caller's JWT, never the service role.

## AI tool families

Narrow, typed tools only — there is no raw SQL tool. The router exposes **one
module's** tools per request, so a fitness request cannot reach financial data.

**Finance:** `create_transaction_draft`, `get_transaction_history`,
`get_spending_summary`, `get_budget_status`, `get_account_balances`,
`get_net_worth`, `get_investment_summary`, `calculate_affordability`.

**Fitness:** `create_workout_draft`, `log_workout_session`,
`update_workout_session`, `get_workout_history`, `get_exercise_progress`,
`get_personal_records`, `update_workout_schedule`, `get_training_consistency`.

Each tool declares a Zod schema for **both** input and output. Model output is
treated as untrusted: validated before execution, never trusted to carry a
computed figure.
