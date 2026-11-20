-- 0006 — Income sources, and the onboarding routine that builds a user's
-- chart of accounts.
--
-- Account creation is a single server-side call rather than a sequence of
-- client inserts: the Supabase client cannot open a multi-statement
-- transaction, so a failure halfway through would leave a half-built chart of
-- accounts with no way to tell which half.

-- ---------------------------------------------------------------------------
-- income_sources
-- ---------------------------------------------------------------------------

create type public.payroll_mode as enum ('net', 'gross');

create table public.income_sources (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  name text not null,

  -- Which account the earnings post to.
  ledger_account_id uuid not null,

  -- 'net' records take-home: the amount that actually reached the bank.
  -- 'gross' additionally posts EPF and TDS legs.
  --
  -- This distinction is load-bearing. In net mode an EPF deduction never
  -- passed through the bank, so posting it as a Bank->EPF transfer would debit
  -- cash that was never there and understate the balance every month.
  payroll_mode public.payroll_mode not null default 'net',

  -- Expected monthly amount, for budgeting. Not a recorded transaction.
  expected_amount public.paise,

  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint income_sources_user_id_id_key unique (user_id, id),
  constraint income_sources_account_fkey
    foreign key (user_id, ledger_account_id)
    references public.ledger_accounts (user_id, id)
    on delete cascade
);

comment on column public.income_sources.payroll_mode is
  'net = take-home recorded; gross = bank + EPF + TDS legs. See D11.';

select app_private.apply_user_rls('public.income_sources');
select public.attach_updated_at('public.income_sources');

create index income_sources_user_idx on public.income_sources (user_id) where is_active;

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------

-- Creates one ledger account plus its satellite row, returning the new id.
create or replace function app_private.create_account(
  p_user_id       uuid,
  p_class         public.account_class,
  p_name          text,
  p_satellite     text,                  -- 'financial' | 'category' | null
  p_account_type  text default null,     -- financial_accounts.account_type
  p_is_fixed      boolean default false,
  p_is_lifestyle  boolean default true,
  p_sort_order    integer default 0
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.ledger_accounts (user_id, account_class, name)
  values (p_user_id, p_class, p_name)
  returning id into new_id;

  if p_satellite = 'financial' then
    insert into public.financial_accounts (ledger_account_id, user_id, account_type)
    values (new_id, p_user_id, p_account_type);
  elsif p_satellite = 'category' then
    insert into public.categories (ledger_account_id, user_id, is_fixed, is_lifestyle, sort_order)
    values (new_id, p_user_id, p_is_fixed, p_is_lifestyle, p_sort_order);
  end if;

  return new_id;
end;
$$;

-- Builds the starting chart of accounts.
--
-- SECURITY INVOKER so RLS and the composite foreign keys apply to the caller,
-- and the user id comes from the verified JWT rather than the payload.
--
-- Note what is deliberately absent: no amounts are posted. Opening balances,
-- budgets and the seed figures are the caller's choice, not a default baked
-- into every account.
create or replace function public.onboard_finance(payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid          uuid := (select auth.uid());
  bank_name    text := coalesce(nullif(payload ->> 'bank_name', ''), 'Savings account');
  with_card    boolean := coalesce((payload ->> 'with_card')::boolean, true);
  with_cash    boolean := coalesce((payload ->> 'with_cash')::boolean, false);
  with_invest  boolean := coalesce((payload ->> 'with_investments')::boolean, true);
  bank_id      uuid;
  salary_id    uuid;
  created      integer := 0;
  category     record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from public.ledger_accounts where user_id = uid) then
    raise exception 'this account already has a chart of accounts'
      using errcode = 'unique_violation';
  end if;

  -- Equity: the counterweight that lets an opening balance exist without
  -- inventing income. Created even when balances start at zero, so adding one
  -- later needs no migration.
  perform app_private.create_account(uid, 'EQUITY', 'Opening balance', null);
  created := created + 1;

  bank_id := app_private.create_account(uid, 'ASSET', bank_name, 'financial', 'bank');
  created := created + 1;

  if with_card then
    perform app_private.create_account(uid, 'LIABILITY', 'Credit card', 'financial', 'credit_card');
    created := created + 1;
  end if;

  if with_cash then
    perform app_private.create_account(uid, 'ASSET', 'Cash', 'financial', 'cash');
    created := created + 1;
  end if;

  if with_invest then
    perform app_private.create_account(uid, 'ASSET', 'Mutual funds', null);
    perform app_private.create_account(uid, 'ASSET', 'Stocks', null);
    perform app_private.create_account(uid, 'ASSET', 'EPF', null);
    created := created + 3;
  end if;

  -- Income. Realized gains are marked not-lifestyle so they reach net worth
  -- and wealth analytics without inflating monthly income or the savings rate.
  salary_id := app_private.create_account(uid, 'INCOME', 'Salary', 'category', null, false, true, 0);
  perform app_private.create_account(uid, 'INCOME', 'Realized capital gains', 'category', null, false, false, 1);
  created := created + 2;

  insert into public.income_sources (user_id, name, ledger_account_id, payroll_mode, expected_amount)
  values (
    uid,
    'Salary',
    salary_id,
    coalesce(nullif(payload ->> 'payroll_mode', ''), 'net')::public.payroll_mode,
    nullif(payload ->> 'expected_income', '')::bigint
  );

  -- Expense categories. "Credit card EMI" is deliberately not among them:
  -- repaying a card settles a liability, and recording it as spending would
  -- double-count the purchase that created the debt.
  for category in
    select * from (values
      ('Rent',                    true,  0),
      ('Food & maid',             true,  1),
      ('Electricity',             true,  2),
      ('Subscriptions',           true,  3),
      ('Groceries',               false, 4),
      ('Bike & petrol',           false, 5),
      ('Gym & boxing',            true,  6),
      ('Mobile & Wi-Fi',          true,  7),
      ('Health & term insurance', true,  8),
      ('Whey & creatine',         false, 9),
      ('Travel',                  false, 10),
      ('Eating out & social',     false, 11),
      ('Shopping & grooming',     false, 12),
      ('Buffer',                  false, 13)
    ) as t(name, is_fixed, sort_order)
  loop
    perform app_private.create_account(
      uid, 'EXPENSE', category.name, 'category', null, category.is_fixed, true, category.sort_order
    );
    created := created + 1;
  end loop;

  update public.profiles set onboarded_at = now() where user_id = uid;

  return jsonb_build_object('accounts_created', created, 'bank_account_id', bank_id);
end;
$$;

comment on function public.onboard_finance is
  'Builds the starting chart of accounts for the calling user. Posts no '
  'amounts: opening balances and budgets are explicit choices, not defaults.';

revoke all on function public.onboard_finance(jsonb) from public, anon;
grant execute on function public.onboard_finance(jsonb) to authenticated;
