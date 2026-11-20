# Database schema

**Status:** Phase 0 has shipped domains and helpers only
(`supabase/migrations/0001_domains_and_helpers.sql`). No tables exist yet. This
document is the design the later phases implement.

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

## Phase 0 — shipped

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

| Table | Attaches to | Holds |
|---|---|---|
| `financial_accounts` | ASSET / LIABILITY | institution, last4, account type, designation |
| `categories` | EXPENSE / INCOME | icon, colour, `is_fixed`, `budget_eligible` |
| `asset_positions` | ASSET (investment) | asset class, ticker/folio, units |
| `liabilities` | LIABILITY | credit limit, APR, statement day, due day |

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

Unrealized gains appear in **no** posting. They exist only as
`valuation_snapshots`, which is exactly why "gains are not income" holds.

### Budgets

`budgets(user_id, period_month, scope)` → `budget_allocations(budget_id,
ledger_account_id, planned paise, rollover bool)` with
`unique (budget_id, ledger_account_id)` — which is what makes "a transaction
affects the appropriate budget exactly once" true. Planned and actual never
share a table.

### Wealth

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

## Fitness

```
exercises, exercise_muscle_groups, exercise_equipment    library, user-extensible
training_plans, training_plan_days                        recurring weekly intent
workout_templates, workout_template_exercises             ordered; superset_group
workout_sessions, workout_session_exercises, workout_sets actuals
personal_records, fitness_goals, cardio_sessions, boxing_sessions
```

- `workout_session_exercises` **snapshots** target sets/reps/weight/rest at
  session start, so editing a template never rewrites a saved session
  ([D7](./PRODUCT_DECISIONS.md)).
- `training_plan_days` is intent; `workout_sessions` are instances with `status`
  (planned / completed / skipped / rescheduled) and `scheduled_for` vs
  `performed_on`. Skipping writes to the session, never mutating the plan.
- `personal_records` is a rebuildable cache; `fitness-core` derives PRs from
  `workout_sets` deterministically.
- Estimated 1RM is computed, never stored as fact, and carries the formula used
  so the UI can label it an estimate.

## AI

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

- Edge Functions build their Supabase client from the **caller's JWT**, never
  the service role, so RLS applies as defence in depth. Service role is reserved
  for migrations and seeding.
- Never trust a client-supplied `user_id`; re-derive it from the verified JWT.
- `SECURITY DEFINER` functions pin `set search_path = ''`.
- Seed configuration is applied per account by an onboarding routine — never
  table defaults or migration literals.
