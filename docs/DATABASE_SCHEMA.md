# Database schema

**Status (2026-11-27):** migrations `0001`–`0016` are applied locally and on
the hosted project. Sections below say which objects are
**shipped** and which are **planned**. Where the two disagree, the migrations
are the truth and this file is wrong.

## What is shipped

| Area | Tables | Views | Functions (RPC) |
|---|---|---|---|
| Identity | `profiles`, `user_preferences`, `module_preferences` | | |
| Chart of accounts | `ledger_accounts`, `financial_accounts`, `categories`, `income_sources` | `account_balances` | `onboard_finance` |
| Ledger | `transactions`, `postings`, `transaction_audit` | `month_summary` | `post_transaction`, `update_transaction`, `delete_transaction`, `restore_transaction`, `transaction_snapshot` |
| Budgets | `budgets`, `budget_allocations` | `budget_status` | |
| Fitness | `exercises`, `exercise_muscles`, `training_plans`, `training_plan_days`, `workout_templates`, `workout_template_exercises`, `workout_sessions`, `workout_session_exercises`, `workout_sets`, `conditioning_sessions`, `bodyweight_entries` | `set_volume`, `exercise_history`, `weekly_muscle_volume` | `seed_training_programme`, `start_workout_session`, `complete_workout_session`, `set_plan_day`, `skip_training_day`, `unskip_training_day`, `user_today` |

Every user table has RLS, grants to `authenticated`, no `anon` access, and
composite `(user_id, id)` foreign keys. `audit_rls()` checks all of this and
runs in pgTAP file `001`.

## Universal rules

Every user-owned row carries:

```sql
id          uuid primary key default gen_random_uuid(),
user_id     uuid not null references auth.users(id) on delete cascade,
created_at  timestamptz not null default now(),
updated_at  timestamptz not null default now(),
unique (user_id, id)   -- enables composite foreign keys, see "Ownership" below
```

`user_id` is denormalised onto child tables so RLS predicates never require a
join. Soft deletion (`deleted_at`) where history matters.

## Domains and helpers — shipped (`0001`)

| Object | Purpose |
|---|---|
| `paise` domain | `BIGINT`, signed. Money in whole paise. |
| `grams` domain | `BIGINT`, non-negative. Weight. |
| `seconds` domain | `INTEGER`, non-negative. Duration. |
| `metres` domain | `INTEGER`, non-negative. Distance. |
| `set_updated_at()` | Trigger function, `search_path` pinned empty. |
| `attach_updated_at(regclass)` | Attaches the trigger to a table. |

## Shared

`profiles`, `user_preferences` (currency, **timezone**, dashboard prefs),
`module_preferences`.

The timezone is load-bearing: all period bucketing uses it, and transaction
dates are `DATE` rather than `timestamptz`. A UTC timestamp moves a 31 March
11pm IST expense into April, silently corrupting "this month".

## Finance

### Chart of accounts

`ledger_accounts` is the single posting target.

```
ledger_accounts(id, user_id, account_class, parent_id, name, currency_code, is_archived)
  account_class ∈ ASSET | LIABILITY | INCOME | EXPENSE | EQUITY
  parent_id — hierarchy: category/subcategory, and bank → emergency-fund sub-account
```

Thin 1:1 satellites hold class-specific metadata, which keeps one foreign-key
target while letting each kind of account carry its own fields:

| Table | Attaches to | Holds | State |
|---|---|---|---|
| `financial_accounts` | ASSET / LIABILITY | institution, account type, designation, `is_default` | shipped |
| `categories` | EXPENSE / INCOME | icon, `is_fixed`, `budget_eligible`, `is_lifestyle`, sort order | shipped |
| `asset_positions` | ASSET (investment) | asset class, ticker/folio, units | planned, Phase 3 |
| `liabilities` | LIABILITY | credit limit, APR, statement day, due day | planned |

**No table stores a balance.** Balances derive from postings.

### Transactions

```
transactions(id, user_id, txn_date date, type, description, merchant,
             payment_method null,          -- NULL = unspecified; never inferred
             reverses_transaction_id null, -- refunds point at the original
             idempotency_key null,         -- recurring/AI dedupe, unique index
             deleted_at null)

postings(id, user_id, transaction_id, ledger_account_id, amount paise)
```

Sign convention: **debit-positive**. Natural balance is `SUM(amount)` for
ASSET/EXPENSE and `-SUM(amount)` for LIABILITY/INCOME/EQUITY.

```sql
-- Must be DEFERRABLE: a plain AFTER trigger rejects the first leg of every
-- multi-leg write, since a single posting never balances on its own.
create constraint trigger postings_must_balance
after insert or update or delete on postings
deferrable initially deferred for each row
execute function assert_transaction_balances();
```

### Posting shapes

| Event | Legs |
|---|---|
| Expense ₹300 by UPI | DR `Expense:Food` 30000 · CR `Asset:Bank` 30000 |
| Salary ₹1.25L | DR `Asset:Bank` 12500000 · CR `Income:Salary` 12500000 |
| Transfer to EF ₹10,000 | DR `Asset:Bank:EF` · CR `Asset:Bank:General` — **no expense leg** |
| Card purchase ₹2,000 | DR `Expense:Shopping` · CR `Liability:Card` |
| Card repayment ₹2,000 | DR `Liability:Card` · CR `Asset:Bank` — **no expense leg** |
| MF purchase ₹5,000 | DR `Asset:Investment:MF` · CR `Asset:Bank` — **no expense leg** |
| MF redemption ₹6,000 (basis ₹5,000) | DR `Asset:Bank` 600000 · CR `Asset:Investment:MF` 500000 · CR `Income:CapitalGains:Realized` 100000 |
| Refund ₹300 | DR `Asset:Bank` · CR `Expense:Food` (original category) |

Edits and deletes go through `update_transaction` / `delete_transaction`,
which write a before/after row to `transaction_audit` in the same transaction.
Deletion is soft (`deleted_at`); `restore_transaction` undoes it, and
`account_balances` ignores deleted transactions.

Unrealized gains appear in **no** posting. They exist only as
`valuation_snapshots`, which is exactly why "gains are not income" holds.

### Budgets

Shipped. `budgets(user_id, period_month, note)`, one per user per month →
`budget_allocations(budget_id,
ledger_account_id, planned paise, rollover bool)` with
`unique (budget_id, ledger_account_id)` — which is what makes "a transaction
affects the appropriate budget exactly once" true. Planned and actual never
share a table.

### Wealth — planned (Phase 3), nothing shipped

```
asset_positions            1:1 with an ASSET account; units numeric(20,6)
investment_transactions    buy/sell, linked to a transactions header
investment_lots            (position, acquired_on, units, unit_cost, units_remaining)
investment_lot_disposals   (lot, disposal_txn, units, proceeds, cost_basis, realized_gain)
valuation_snapshots        (position, as_of_date, unit_price) APPEND-ONLY
emergency_fund_settings    targets only — no balance authority
emergency_fund_events      contribution/withdrawal log
net_worth_snapshots        point-in-time assets/liabilities/net worth
savings_goals, goal_contributions
```

- Units are `numeric(20,6)`, not paise — mutual-fund units are fractional.
  Money stays integral; quantities do not.
- Disposals consume lots **FIFO** (Indian equity/MF tax treatment), one explicit
  disposal row per lot touched. A single `avg_cost` column cannot preserve
  remaining cost basis on a partial sale.
- `valuation_snapshots` is append-only **enforced by RLS**: SELECT and INSERT
  policies only, and deliberately *no* UPDATE or DELETE policy. Historical
  preservation then holds at the database layer rather than by convention.
- `liability_transactions` is a **view** over postings, not a table
  ([D5](./PRODUCT_DECISIONS.md)).

## Fitness — shipped (`0013`–`0016`)

```
exercises                   library; equipment, weight_basis, is_unilateral, default rest
exercise_muscles            exercise × muscle_group × role (primary/secondary)
training_plans              one active plan per user
training_plan_days          weekday → label, session_kind, template_id (nullable)
workout_templates           named templates (Push, Pull, …)
workout_template_exercises  ordered; target_sets, rep_min/rep_max, rest; superset_group
workout_sessions            instances: status, scheduled_for, performed_on, started/ended_at
workout_session_exercises   snapshot: name, target_sets, rep_min/rep_max, rest
workout_sets                weight_grams, reps, rir, is_warmup, side, assistance_grams
conditioning_sessions       boxing / cardio: activity, duration, distance, intensity
bodyweight_entries          one per day, grams
```

- `session_kind`: `gym | striking | optional | recovery`.
- `session_status`: `planned | in_progress | completed | skipped`. There is
  deliberately **no `missed` status**: missed is derived by `fitness-core`
  (`Consistency.classifyDay`) from the plan, sessions and conditioning, so it
  needs no scheduler and cannot go stale.
- **Plan versions** (`0016`): `training_plans.effective_from` / `effective_to`
  (exclusive). An exclusion constraint forbids overlapping versions, and a
  trigger refuses edits to the days of a version that has started.
  `set_plan_day` changes the plan from today forward by closing the current
  version and starting a new one, so past days keep the plan they were
  judged against. `is_active` is kept and constrained to equal
  `effective_to is null`.
- **Skips** (`0016`): `skip_training_day(date, reason)` writes a `skipped`
  session against the plan that applied that day; refused on rest and
  optional days and once training is logged. `unskip_training_day` removes
  only skips. Starting a workout on a skipped day turns the skip into the
  session. Untemplated (striking) days have their own one-per-day index.
- `workout_session_exercises` **snapshots** the template at session start
  (name, target sets, rep range, rest), so editing a template never rewrites a
  saved session ([D7](./PRODUCT_DECISIONS.md)). Target *weight* is not part of
  the snapshot: templates do not prescribe weights.
- `start_workout_session(template, date)` does the snapshot in one transaction
  and returns the existing session if one exists for that template and date
  (`unique (user_id, template_id, performed_on)`).
- `complete_workout_session(id)` refuses a session with no working sets
  (non-warm-up, reps > 0).
- Views: `set_volume` (per set, grams), `exercise_history`,
  `weekly_muscle_volume`. Warm-ups are excluded from volume.

**Planned, not shipped:** `personal_records` (a rebuildable cache;
`fitness-core` derives PRs from `workout_sets` deterministically),
`fitness_goals`. Estimated 1RM will be computed,
never stored as fact, and labelled with its formula.

## AI — planned (Phase 4), nothing shipped

`chat_sessions`, `chat_messages`, `ai_action_logs` (every proposed and executed
tool call, with module scope).

## Security

### Policy pattern — every user-owned table

```sql
alter table <t> enable row level security;

create policy sel on <t> for select using (user_id = (select auth.uid()));
create policy ins on <t> for insert with check (user_id = (select auth.uid()));
create policy upd on <t> for update
  using (user_id = (select auth.uid()))        -- rows I may touch
  with check (user_id = (select auth.uid()));  -- what I may leave behind
create policy del on <t> for delete using (user_id = (select auth.uid()));
```

Two details that are easy to get wrong:

1. **`with check` on UPDATE is not optional.** Without it, a user can update
   their own row and set `user_id` to someone else's, giving away or stealing a
   record.
2. **`(select auth.uid())`**, not bare `auth.uid()` — Postgres then evaluates it
   once as an InitPlan instead of per row, which matters on history scans.

### Ownership — the gap RLS does not close

Foreign-key checks execute as the **table owner and bypass row security**, so
RLS alone cannot stop a user referencing someone else's parent row. Nothing
would prevent a posting on my own transaction pointing at *your* ledger account,
leaking your balances into my totals.

The fix is to make ownership part of the key:

```sql
alter table postings
  add foreign key (user_id, ledger_account_id) references ledger_accounts (user_id, id),
  add foreign key (user_id, transaction_id)    references transactions    (user_id, id);
```

A cross-user reference is then a foreign-key violation inside the database,
independent of application logic or a compromised client. Applied to every
parent/child pair in both modules.

### Other controls

- (Planned; no Edge Functions exist yet.) Edge Functions build their Supabase client from the **caller's JWT**, never
  the service role, so RLS applies as defence in depth. Service role is reserved
  for migrations and seeding.
- Never trust a client-supplied `user_id`; re-derive it from the verified JWT.
- `SECURITY DEFINER` functions pin `set search_path = ''`.
- A `SECURITY INVOKER` function in `public` must not call into `app_private`:
  `authenticated` has no `USAGE` on that schema, so the call fails for every
  real user while tests run as a privileged role still pass.
- RLS is not a grant. Every table also needs `GRANT`s to `authenticated`,
  which the local stack adds by default and the hosted project does not
  (`0007_grants.sql`, `0008_revoke_anon.sql`).
- Seed configuration is applied per account by an onboarding routine — never
  table defaults or migration literals.
