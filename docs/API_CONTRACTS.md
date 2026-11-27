# API contracts

**Status (2026-11-27):** the database RPCs below are shipped. The app calls
them through `supabase.rpc()` from `apps/mobile/lib/queries/`. Edge Functions
and AI tools are **planned** (Phase 4); none exist yet.

Plain reads (accounts, balances, history, budgets, plan, sessions) go through
PostgREST table and view selects under RLS, not RPCs. RPCs exist only where a
write must be atomic or must run logic the client should not be trusted with.

All shipped RPCs are `SECURITY INVOKER` with `search_path = ''`, executable by
`authenticated` only (revoked from `anon` and `public`). The user id always
comes from the verified JWT (`auth.uid()`); any `user_id` in a payload is
ignored.

## Database RPC — shipped

### Finance

| Function | Returns | Notes |
|---|---|---|
| `onboard_finance(payload jsonb default '{}')` | `jsonb` | Creates the user's starting chart of accounts and income source. Payload (all optional): `bank_name`, `with_card`, `with_cash`, `with_investments`, `payroll_mode` (`net`/`gross`), `expected_income` (paise). No figures are hardcoded: amounts come from the payload. |
| `post_transaction(payload jsonb)` | `uuid` | The only write path for new transactions: header + 2 or more legs in one server-side transaction, because the Supabase client cannot open a multi-statement transaction. A deferred constraint trigger rejects legs that do not sum to zero. |
| `update_transaction(p_transaction_id uuid, payload jsonb)` | `uuid` | Replaces header and legs atomically; same payload as `post_transaction`. Writes before/after to `transaction_audit`. |
| `delete_transaction(p_transaction_id uuid)` | `uuid` | Soft delete (`deleted_at`), audited. Balances stop counting it immediately. |
| `restore_transaction(p_transaction_id uuid)` | `uuid` | Undoes a soft delete, audited. |
| `transaction_snapshot(p_transaction_id uuid)` | `jsonb` | Header + legs as JSON; used for audit rows. Stable, read-only. |

`post_transaction` / `update_transaction` payload:

```jsonc
{
  "txn_date": "2026-11-21",          // DATE in the user's timezone, not a timestamp
  "type": "expense",                 // income | expense | transfer | cc_purchase | cc_repayment
                                     // | investment_buy | investment_sell | refund
                                     // | adjustment | opening_balance
  "description": "Lunch",            // optional
  "merchant": "…",                   // optional
  "payment_method": "upi",           // optional; null means unspecified, never inferred
  "notes": "…",                      // optional
  "reverses_transaction_id": null,   // optional; refunds point at the original
  "idempotency_key": null,           // optional; unique per user
  "postings": [                      // 2+ legs, integer paise, debit-positive, sum = 0
    { "ledger_account_id": "…", "amount": 30000, "memo": "optional" },
    { "ledger_account_id": "…", "amount": -30000 }
  ]
}
```

Clients build legs with `finance-core` (`Postings` builders →
`toRpcPostings`), never by hand.

### Fitness

| Function | Returns | Notes |
|---|---|---|
| `seed_training_programme()` | `jsonb` `{exercises, templates, plan_days}` | Creates the caller's exercise library, templates and active weekly plan. |
| `start_workout_session(p_template_id uuid, p_performed_on date)` | `uuid` | Creates an `in_progress` session and snapshots the template's exercises in one transaction. Idempotent per template per date: re-calling returns the existing session. On a skipped day it turns the skip into an in-progress session (`0016`). Raises `P0002` if the template is not the caller's. |
| `set_plan_day(p_weekday smallint, p_kind session_kind, p_label text, p_template_id uuid default null, p_from date default today)` | `uuid` (plan version) | Changes one weekday from `p_from` forward. Refuses past dates (`23514`). If the current version already started, closes it and starts a new one. Gym days require a template; other kinds must not have one. |
| `skip_training_day(p_date date, p_reason text default null)` | `uuid` | Records a deliberate skip against the plan that applied on `p_date`. Idempotent. `23514` on rest/optional days or once training is logged; `P0002` if nothing was planned. |
| `unskip_training_day(p_date date)` | `integer` (rows removed) | Removes skips only; never a started or completed session. |
| `user_today()` | `date` | Today in the caller's `user_preferences.timezone`. |
| `complete_workout_session(p_session_id uuid)` | `void` | Marks an `in_progress` session `completed`. Raises `23514` if it has no working sets (non-warm-up, reps > 0) or is not in progress; `P0002` if not the caller's. |

Sets are logged and removed with plain inserts and deletes on `workout_sets`
under RLS. Each set is one row, so no RPC is needed for atomicity. An earlier
draft planned a single `log_workout_session(payload jsonb)`; that was replaced
by the start → log sets → complete lifecycle so a session survives a dropped
connection mid-workout.

### Error codes clients rely on

| SQLSTATE | Meaning |
|---|---|
| `42501` `insufficient_privilege` | Not authenticated. |
| `P0002` `no_data_found` | Target row missing or not the caller's (RLS makes the two indistinguishable, on purpose). |
| `23514` `check_violation` | A business rule refused the write (unbalanced legs, invalid state transition, nothing logged). |
| `23505` `unique_violation` | Duplicate (idempotency key, set index, one budget per month). |
| `23P01` `exclusion_violation` | Two plan versions would cover the same day. |
| `23502` `not_null_violation` | A required argument was null (e.g. a session with no date). |

## Edge Functions — planned (Phase 4)

| Function | Notes |
|---|---|
| `ai-extract` | Natural language → structured draft. Returns a proposal; never writes. |
| `ai-chat` | Grounded Q&A over the caller's own data. |

Both will build their Supabase client from the caller's JWT, never the service
role. Provider credentials live only in Edge Function secrets.

## AI tool families — planned (Phase 4)

Narrow, typed tools only. There is no raw SQL tool. The router exposes **one
module's** tools per request, so a fitness request cannot reach financial data.

**Finance:** `create_transaction_draft`, `get_transaction_history`,
`get_spending_summary`, `get_budget_status`, `get_account_balances`,
`get_net_worth`, `get_investment_summary`, `calculate_affordability`.

**Fitness:** `create_workout_draft`, `start_workout_session`, `log_set`,
`get_workout_history`, `get_exercise_progress`, `get_personal_records`,
`update_workout_schedule`, `get_training_consistency`.

Each tool will declare a schema for **both** input and output (library not yet
chosen; Zod is not currently installed). Model output is treated as untrusted:
validated before execution, never trusted to carry a computed figure. Write
tools produce drafts that the user confirms.
