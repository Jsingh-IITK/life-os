-- 0003 — Identity: profiles, preferences, module preferences.
--
-- A new user must become fully usable without any manual database work, so a
-- trigger on auth.users provisions these rows on signup. Note what is *not*
-- seeded here: no financial configuration, no categories, no accounts. The
-- founder's ₹1,25,000 / ₹70,500 figures belong to one account's onboarding, not
-- to table defaults — otherwise they silently become every user's numbers.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url  text,
  onboarded_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'One row per user. user_id is both PK and FK to auth.users.';
comment on column public.profiles.onboarded_at is
  'Null until the user completes onboarding. Drives whether seed configuration is offered.';

select app_private.apply_user_rls('public.profiles');
select public.attach_updated_at('public.profiles');

-- ---------------------------------------------------------------------------
-- user_preferences
-- ---------------------------------------------------------------------------

create table public.user_preferences (
  user_id        uuid primary key references auth.users (id) on delete cascade,

  -- INR is the default, not an assumption baked into the schema: amounts carry
  -- their own currency at the account level so multi-currency stays possible.
  currency_code  char(3) not null default 'INR',

  -- Load-bearing. All month and week bucketing uses this, and transaction dates
  -- are DATE rather than timestamptz, because a UTC timestamp puts a 31 March
  -- 11pm IST expense into April and silently corrupts "this month".
  timezone       text not null default 'Asia/Kolkata',

  locale         text not null default 'en-IN',
  week_starts_on smallint not null default 1
                 constraint week_starts_on_valid check (week_starts_on between 0 and 6),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.user_preferences.timezone is
  'IANA timezone. Authoritative for all period bucketing — never bucket money '
  'periods by UTC timestamps.';

select app_private.apply_user_rls('public.user_preferences');
select public.attach_updated_at('public.user_preferences');

-- ---------------------------------------------------------------------------
-- module_preferences
-- ---------------------------------------------------------------------------

create table public.module_preferences (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  module     text not null
             constraint module_known check (module in ('finance', 'fitness', 'habits', 'journal')),
  is_enabled boolean not null default true,
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint module_preferences_user_module_key unique (user_id, module),
  constraint module_preferences_user_id_id_key  unique (user_id, id)
);

comment on table public.module_preferences is
  'Per-user, per-module enablement and settings. Modules are first-class, so '
  'each carries its own preferences rather than sharing one settings blob.';

select app_private.apply_user_rls('public.module_preferences');
select public.attach_updated_at('public.module_preferences');

create index module_preferences_user_idx on public.module_preferences (user_id);

-- ---------------------------------------------------------------------------
-- Provisioning on signup
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER is required: the trigger fires inside Supabase's auth
-- machinery, where the caller has no rights on these tables. search_path is
-- pinned empty so a shadowing object cannot hijack the unqualified lookups.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');

  insert into public.user_preferences (user_id)
  values (new.id);

  -- Finance and Fitness are the shipped modules; the future ones are not
  -- provisioned so that enabling them later is an explicit act.
  insert into public.module_preferences (user_id, module)
  values (new.id, 'finance'), (new.id, 'fitness');

  return new;
end;
$$;

comment on function app_private.handle_new_user is
  'Provisions a usable account on signup so no manual database work is needed. '
  'Deliberately seeds no financial configuration.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();
