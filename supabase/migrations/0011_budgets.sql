-- 0011 — Monthly budgets.
--
-- A budget is a plan, not a record of events. Planned amounts live here and
-- actuals live in postings; the two never share a table, which is what keeps
-- "planned budgets are not actual expenditure" true by construction rather
-- than by remembering to filter.
--
-- What counts as spending against a budget is decided by the ledger, not by
-- this schema: only postings to EXPENSE accounts are counted, so transfers,
-- card repayments and investment purchases are excluded because they post no
-- expense leg at all. There is no rule here to get wrong.

create table public.budgets (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- First day of the month the budget covers, in the user's timezone.
  -- A DATE rather than a timestamp, for the same reason txn_date is.
  period_month date not null
               constraint period_is_first_of_month
               check (period_month = date_trunc('month', period_month)::date),

  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint budgets_user_id_id_key unique (user_id, id),
  -- One budget per month. Two would make "the" budget ambiguous.
  constraint budgets_one_per_month unique (user_id, period_month)
);

comment on table public.budgets is
  'A monthly plan. Holds no amounts — those are in budget_allocations.';

select app_private.apply_user_rls('public.budgets');
select public.attach_updated_at('public.budgets');
grant select, insert, update, delete on public.budgets to authenticated;

create index budgets_user_period_idx on public.budgets (user_id, period_month desc);

-- ---------------------------------------------------------------------------

create table public.budget_allocations (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null,

  budget_id         uuid not null,
  -- An EXPENSE account. Enforced by trigger below.
  ledger_account_id uuid not null,

  planned public.paise not null
          constraint planned_not_negative check (planned >= 0),

  -- Carry an unspent remainder into next month, where configured.
  rollover boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint budget_allocations_user_id_id_key unique (user_id, id),

  -- This is what delivers "a transaction affects the appropriate budget
  -- exactly once": a category cannot be allocated twice in one month, so
  -- its spending cannot be counted against two allocations.
  constraint budget_allocations_one_per_category unique (budget_id, ledger_account_id),

  constraint budget_allocations_budget_fkey
    foreign key (user_id, budget_id)
    references public.budgets (user_id, id)
    on delete cascade,

  constraint budget_allocations_account_fkey
    foreign key (user_id, ledger_account_id)
    references public.ledger_accounts (user_id, id)
    on delete restrict
);

select app_private.apply_user_rls('public.budget_allocations');
select public.attach_updated_at('public.budget_allocations');
grant select, insert, update, delete on public.budget_allocations to authenticated;

create index budget_allocations_budget_idx
  on public.budget_allocations (user_id, budget_id);

-- Budgeting an income or asset account is meaningless; refuse it rather than
-- producing a line that can never be spent against.
create trigger budget_allocations_class_guard
  before insert or update of ledger_account_id on public.budget_allocations
  for each row execute function app_private.assert_account_class('{EXPENSE}');

-- ---------------------------------------------------------------------------
-- Planned against actual
-- ---------------------------------------------------------------------------

-- Pairs each allocation with what was actually spent in that month.
--
-- Only postings to the allocated EXPENSE account within the budget's month
-- count, and only from transactions that are not deleted. A refund credits
-- the same category, so it reduces the actual here without any special case.
--
-- security_invoker so the underlying RLS applies to the caller; without it a
-- view runs as its owner and bypasses row security entirely.
create view public.budget_status
with (security_invoker = true)
as
select
  a.user_id,
  a.budget_id,
  b.period_month,
  a.id                as allocation_id,
  a.ledger_account_id,
  la.name             as category_name,
  a.planned,
  a.rollover,
  coalesce(sum(p.amount), 0)::bigint as actual
from public.budget_allocations a
join public.budgets b
  on b.id = a.budget_id and b.user_id = a.user_id
join public.ledger_accounts la
  on la.id = a.ledger_account_id and la.user_id = a.user_id
left join public.postings p
  on p.ledger_account_id = a.ledger_account_id
 and p.user_id = a.user_id
left join public.transactions t
  on t.id = p.transaction_id
 and t.user_id = p.user_id
 and t.deleted_at is null
 and t.txn_date >= b.period_month
 and t.txn_date < (b.period_month + interval '1 month')::date
-- Excludes postings whose transaction falls outside the month or is deleted,
-- while keeping allocations that have no spending at all.
where p.id is null or t.id is not null
group by a.user_id, a.budget_id, b.period_month, a.id, a.ledger_account_id, la.name,
         a.planned, a.rollover;

comment on view public.budget_status is
  'Each allocation with its actual spend for that month. Actuals come from '
  'EXPENSE postings only, so transfers and card repayments are excluded '
  'structurally rather than by a filter.';

grant select on public.budget_status to authenticated;
