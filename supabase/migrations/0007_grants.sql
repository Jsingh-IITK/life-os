-- 0007 — Table privileges for the authenticated role.
--
-- Row Level Security decides WHICH ROWS a role may touch. It does not grant
-- the role any privilege on the table in the first place. Both are required:
-- without a GRANT, every query fails with "permission denied for table",
-- regardless of how correct the policies are.
--
-- This was missed because the local Supabase stack ships default privileges
-- that grant these automatically, while the hosted project does not — so the
-- pgTAP suite passed against a database that was configured differently from
-- production. Granting explicitly makes the two match and removes the
-- dependency on ambient defaults.
--
-- Granting broadly here is safe precisely because RLS is already enabled on
-- every one of these tables: the privilege opens the table, the policy still
-- restricts it to the caller's own rows.

grant usage on schema public to anon, authenticated;

-- Full access, restricted to own rows by the owner_* policies.
grant select, insert, update, delete on
  public.profiles,
  public.user_preferences,
  public.module_preferences,
  public.ledger_accounts,
  public.financial_accounts,
  public.categories,
  public.transactions,
  public.postings,
  public.income_sources
to authenticated;

-- Derived balances are read-only by nature: there is nothing to write to.
grant select on public.account_balances to authenticated;

-- Future tables in public get the same treatment, so a new migration cannot
-- reintroduce this gap by forgetting a grant. RLS remains the gate.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- anon is granted nothing: an unauthenticated client must reach no user data.

-- ---------------------------------------------------------------------------
-- Make the gap visible to tests
-- ---------------------------------------------------------------------------

-- Extends the RLS audit to cover privileges, so a table that is policied but
-- unreachable — or reachable but unpoliced — is reported rather than
-- discovered in production.
create or replace function app_private.audit_rls()
returns table (table_name text, problem text)
language sql
stable
set search_path = ''
as $$
  with owned as (
    select c.oid, (c.relname)::text as name, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not a.attisdropped
  )
  select o.name, 'RLS is not enabled'
  from owned o
  where not o.relrowsecurity

  union all
  select o.name, 'no SELECT policy'
  from owned o
  where not exists (select 1 from pg_policy p where p.polrelid = o.oid and p.polcmd = 'r')

  union all
  select o.name, 'no INSERT policy'
  from owned o
  where not exists (select 1 from pg_policy p where p.polrelid = o.oid and p.polcmd = 'a')

  union all
  select o.name, 'UPDATE policy is missing WITH CHECK (ownership can be reassigned)'
  from owned o
  join pg_policy p on p.polrelid = o.oid and p.polcmd = 'w'
  where p.polwithcheck is null

  union all
  select o.name, 'user_id is nullable'
  from owned o
  join pg_attribute a on a.attrelid = o.oid and a.attname = 'user_id'
  where not a.attnotnull

  union all
  -- Policied but unreachable: the table has RLS and policies, but the role
  -- cannot open it at all.
  select o.name, 'authenticated lacks SELECT privilege (RLS alone is not a grant)'
  from owned o
  where not has_table_privilege('authenticated', o.oid, 'SELECT')

  union all
  select o.name, 'anon can SELECT (unauthenticated clients must reach no user data)'
  from owned o
  where has_table_privilege('anon', o.oid, 'SELECT')
$$;
