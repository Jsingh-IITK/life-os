-- 0004 — Chart of accounts.
--
-- `ledger_accounts` is the single posting target for the whole Finance module:
-- bank accounts, credit cards, expense categories, income sources and
-- investment holdings are all accounts, distinguished by account_class. Thin
-- 1:1 satellite tables carry the fields specific to each kind.
--
-- The alternative — separate tables for categories and accounts, each
-- referenced from postings — needs either two nullable foreign keys or a
-- polymorphic reference, and both make "which account did this hit?" a
-- conditional rather than a join.
--
-- Note: no table here stores a balance. Balances derive from postings.

create type public.account_class as enum (
  'ASSET',      -- bank, cash, investments, receivables
  'LIABILITY',  -- credit cards, loans
  'INCOME',     -- salary, interest, realized gains
  'EXPENSE',    -- spending categories
  'EQUITY'      -- opening balances; the counterweight that makes the first entry balance
);

-- ---------------------------------------------------------------------------
-- ledger_accounts
-- ---------------------------------------------------------------------------

create table public.ledger_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  account_class public.account_class not null,

  -- Hierarchy serves two jobs: category/subcategory, and the bank → emergency
  -- fund sub-account that keeps a designated fund from double-counting.
  parent_id     uuid,

  name          text not null constraint name_not_blank check (length(btrim(name)) > 0),
  currency_code char(3) not null default 'INR',
  is_archived   boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Required as the target of composite foreign keys. Redundant with the
  -- primary key index, deliberately: it is what lets children prove ownership.
  constraint ledger_accounts_user_id_id_key unique (user_id, id),

  -- Ownership-carrying self reference. A user cannot parent their account to
  -- someone else's, because the pair (user_id, parent_id) must exist as that
  -- same user's row. With parent_id null the constraint simply does not apply.
  constraint ledger_accounts_parent_fkey
    foreign key (user_id, parent_id)
    references public.ledger_accounts (user_id, id)
    on delete restrict,

  -- Sibling names stay unique. NULLS NOT DISTINCT so two top-level accounts
  -- cannot share a name either; without it, null parent_id makes every
  -- top-level row distinct and the constraint does nothing where it matters.
  constraint ledger_accounts_sibling_name_key
    unique nulls not distinct (user_id, parent_id, name)
);

comment on table public.ledger_accounts is
  'The chart of accounts: the only foreign-key target for postings.';
comment on column public.ledger_accounts.parent_id is
  'Hierarchy for category/subcategory and for designated sub-accounts such as '
  'an emergency fund held inside a bank account.';

select app_private.apply_user_rls('public.ledger_accounts');
select public.attach_updated_at('public.ledger_accounts');

create index ledger_accounts_user_class_idx
  on public.ledger_accounts (user_id, account_class) where not is_archived;
create index ledger_accounts_parent_idx
  on public.ledger_accounts (user_id, parent_id);

-- A child must share its parent's class. Without this an expense category can
-- be parented under a bank account, and hierarchy rollups become nonsense.
create or replace function app_private.assert_parent_class_matches()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_class public.account_class;
begin
  if new.parent_id is null then
    return new;
  end if;

  select account_class into parent_class
  from public.ledger_accounts
  where id = new.parent_id;

  if parent_class is distinct from new.account_class then
    raise exception
      'account % is %, but its parent % is % — a child must share its parent''s class',
      new.name, new.account_class, new.parent_id, parent_class;
  end if;

  return new;
end;
$$;

create trigger ledger_accounts_parent_class
  before insert or update of parent_id, account_class on public.ledger_accounts
  for each row execute function app_private.assert_parent_class_matches();

-- Shared guard for satellite tables: the account they decorate must be of an
-- expected class, otherwise the satellite's columns are meaningless.
create or replace function app_private.assert_account_class()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[] := tg_argv[0]::text[];
  actual  public.account_class;
begin
  select account_class into actual
  from public.ledger_accounts
  where id = new.ledger_account_id;

  if actual is null then
    raise exception 'ledger account % does not exist', new.ledger_account_id;
  end if;

  if not (actual::text = any (allowed)) then
    raise exception '% requires an account of class %, but % is %',
      tg_table_name, allowed, new.ledger_account_id, actual;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- financial_accounts — bank / cash / card metadata
-- ---------------------------------------------------------------------------

create table public.financial_accounts (
  ledger_account_id uuid primary key,
  user_id           uuid not null,

  account_type text not null
    constraint account_type_known
    check (account_type in ('bank', 'cash', 'credit_card', 'wallet', 'other')),

  institution  text,
  last_four    text constraint last_four_shape check (last_four ~ '^[0-9]{4}$'),

  -- Designation marks intent, not a separate pot of money. A designated
  -- emergency fund is modelled as a child ledger account so the money is only
  -- ever counted once; this column is for labelling and filtering.
  designation  text not null default 'general'
    constraint designation_known
    check (designation in ('general', 'emergency_fund', 'travel_fund', 'goal', 'other')),

  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint financial_accounts_user_id_id_key unique (user_id, ledger_account_id),
  constraint financial_accounts_ledger_fkey
    foreign key (user_id, ledger_account_id)
    references public.ledger_accounts (user_id, id)
    on delete cascade
);

comment on table public.financial_accounts is
  'Metadata for cash-like accounts. Holds no balance — balances derive from postings.';

select app_private.apply_user_rls('public.financial_accounts');
select public.attach_updated_at('public.financial_accounts');

create trigger financial_accounts_class_guard
  before insert or update of ledger_account_id on public.financial_accounts
  for each row execute function app_private.assert_account_class('{ASSET,LIABILITY}');

-- Exactly one default account per user.
create unique index financial_accounts_one_default_idx
  on public.financial_accounts (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- categories — expense / income presentation and budgeting flags
-- ---------------------------------------------------------------------------

create table public.categories (
  ledger_account_id uuid primary key,
  user_id           uuid not null,

  icon   text,
  color  text constraint color_shape check (color ~ '^#[0-9A-Fa-f]{6}$'),

  -- Fixed vs variable drives the dashboard's committed-expense split.
  is_fixed        boolean not null default false,
  budget_eligible boolean not null default true,

  -- False for realized capital gains, which must reach net worth and wealth
  -- analytics without inflating monthly income or the savings rate.
  is_lifestyle    boolean not null default true,

  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_user_id_id_key unique (user_id, ledger_account_id),
  constraint categories_ledger_fkey
    foreign key (user_id, ledger_account_id)
    references public.ledger_accounts (user_id, id)
    on delete cascade
);

comment on column public.categories.is_lifestyle is
  'False for income that is not spendable earnings — realized capital gains in '
  'particular, which belong in net worth but not in monthly income.';

select app_private.apply_user_rls('public.categories');
select public.attach_updated_at('public.categories');

create trigger categories_class_guard
  before insert or update of ledger_account_id on public.categories
  for each row execute function app_private.assert_account_class('{INCOME,EXPENSE}');
