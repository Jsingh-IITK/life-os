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
  uid         uuid := (select auth.uid());
  bank_name   text := coalesce(nullif(payload ->> 'bank_name', ''), 'Savings account');
  with_card   boolean := coalesce((payload ->> 'with_card')::boolean, true);
  with_cash   boolean := coalesce((payload ->> 'with_cash')::boolean, false);
  with_invest boolean := coalesce((payload ->> 'with_investments')::boolean, true);
  bank_id     uuid;
  salary_id   uuid;
  created     integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from public.ledger_accounts where user_id = uid) then
    raise exception 'this account already has a chart of accounts'
      using errcode = 'unique_violation';
  end if;

  -- One statement, so a failure leaves nothing behind rather than a
  -- half-built chart of accounts. The satellite inserts read the RETURNING
  -- rows of the ledger insert, which is why this does not need a helper
  -- function in app_private — a schema the authenticated role deliberately
  -- has no access to.
  with spec (name, class, satellite, account_type, is_fixed, is_lifestyle, sort_order, include) as (
    values
      -- The counterweight that lets an opening balance exist later without
      -- inventing income. Created even though balances start at zero.
      ('Opening balance',         'EQUITY',    null::text,  null::text,     false, true,  0,  true),

      (bank_name,                 'ASSET',     'financial', 'bank',         false, true,  0,  true),
      ('Credit card',             'LIABILITY', 'financial', 'credit_card',  false, true,  0,  with_card),
      ('Cash',                    'ASSET',     'financial', 'cash',         false, true,  0,  with_cash),

      ('Mutual funds',            'ASSET',     null,        null,           false, true,  0,  with_invest),
      ('Stocks',                  'ASSET',     null,        null,           false, true,  0,  with_invest),
      ('EPF',                     'ASSET',     null,        null,           false, true,  0,  with_invest),

      ('Salary',                  'INCOME',    'category',  null,           false, true,  0,  true),
      -- Not lifestyle income: reaches net worth and wealth analytics without
      -- inflating monthly income or the savings rate.
      ('Realized capital gains',  'INCOME',    'category',  null,           false, false, 1,  true),

      -- Committed expenses, 65,500. "Credit card EMI" is deliberately absent:
      -- repaying a card settles a liability, and booking it as spending would
      -- double-count the purchase that created the debt.
      ('Rent',                    'EXPENSE',   'category',  null,           true,  true,  0,  true),
      ('Food & maid',             'EXPENSE',   'category',  null,           true,  true,  1,  true),
      ('Electricity',             'EXPENSE',   'category',  null,           true,  true,  2,  true),
      ('Subscriptions',           'EXPENSE',   'category',  null,           true,  true,  3,  true),
      ('Groceries',               'EXPENSE',   'category',  null,           false, true,  4,  true),
      ('Bike & petrol',           'EXPENSE',   'category',  null,           false, true,  5,  true),
      ('Gym & boxing',            'EXPENSE',   'category',  null,           true,  true,  6,  true),
      ('Mobile & Wi-Fi',          'EXPENSE',   'category',  null,           true,  true,  7,  true),
      ('Health & term insurance', 'EXPENSE',   'category',  null,           true,  true,  8,  true),
      ('Whey & creatine',         'EXPENSE',   'category',  null,           false, true,  9,  true),

      -- Discretionary allocations, 19,500.
      ('Travel',                  'EXPENSE',   'category',  null,           false, true,  10, true),
      ('Eating out & social',     'EXPENSE',   'category',  null,           false, true,  11, true),
      ('Shopping & grooming',     'EXPENSE',   'category',  null,           false, true,  12, true),
      ('Buffer',                  'EXPENSE',   'category',  null,           false, true,  13, true)
  ),
  inserted as (
    insert into public.ledger_accounts (user_id, account_class, name)
    select uid, s.class::public.account_class, s.name
    from spec s
    where s.include
    returning id, name
  ),
  financial as (
    insert into public.financial_accounts (ledger_account_id, user_id, account_type)
    select i.id, uid, s.account_type
    from inserted i
    join spec s on s.name = i.name
    where s.satellite = 'financial'
    returning 1
  ),
  categorised as (
    insert into public.categories (ledger_account_id, user_id, is_fixed, is_lifestyle, sort_order)
    select i.id, uid, s.is_fixed, s.is_lifestyle, s.sort_order
    from inserted i
    join spec s on s.name = i.name
    where s.satellite = 'category'
    returning 1
  )
  select count(*)::integer into created from inserted;

  select id into bank_id from public.ledger_accounts
    where user_id = uid and name = bank_name;
  select id into salary_id from public.ledger_accounts
    where user_id = uid and name = 'Salary';

  insert into public.income_sources (user_id, name, ledger_account_id, payroll_mode, expected_amount)
  values (
    uid,
    'Salary',
    salary_id,
    coalesce(nullif(payload ->> 'payroll_mode', ''), 'net')::public.payroll_mode,
    nullif(payload ->> 'expected_income', '')::bigint
  );

  update public.profiles set onboarded_at = now() where user_id = uid;

  return jsonb_build_object('accounts_created', created, 'bank_account_id', bank_id);
end;
$$;

comment on function public.onboard_finance is
  'Builds the starting chart of accounts for the calling user. Posts no '
  'amounts: opening balances and budgets are explicit choices, not defaults.';

revoke all on function public.onboard_finance(jsonb) from public, anon;
grant execute on function public.onboard_finance(jsonb) to authenticated;
