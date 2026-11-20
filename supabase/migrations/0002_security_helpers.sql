-- 0002 — Security helpers.
--
-- Row Level Security is applied through a helper rather than hand-written per
-- table, for one specific reason: the most common and most dangerous RLS bug is
-- an UPDATE policy with `using` but no `with check`, which lets a user rewrite
-- their own row's user_id and hand a record to — or steal one from — another
-- user. Generating the policies makes that omission impossible.
--
-- The audit function at the bottom then makes a *missing* policy impossible to
-- ship unnoticed, because a test asserts it returns no rows.

create schema if not exists app_private;

comment on schema app_private is
  'Internal helpers and trigger functions. Not exposed through the API.';

revoke all on schema app_private from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Standard owner-only policy set
-- ---------------------------------------------------------------------------

create or replace function app_private.apply_user_rls(target regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  tbl text := target::text;
begin
  execute format('alter table %s enable row level security', tbl);

  -- Read: only my own rows.
  execute format(
    'create policy owner_select on %s for select to authenticated
       using (user_id = (select auth.uid()))', tbl);

  -- Insert: I may only create rows owned by me.
  execute format(
    'create policy owner_insert on %s for insert to authenticated
       with check (user_id = (select auth.uid()))', tbl);

  -- Update: `using` decides which rows I may touch; `with check` decides what
  -- I am allowed to leave behind. Both are required — without the second, a
  -- user can set user_id to someone else and transfer ownership of the row.
  execute format(
    'create policy owner_update on %s for update to authenticated
       using (user_id = (select auth.uid()))
       with check (user_id = (select auth.uid()))', tbl);

  execute format(
    'create policy owner_delete on %s for delete to authenticated
       using (user_id = (select auth.uid()))', tbl);
end;
$$;

comment on function app_private.apply_user_rls is
  'Applies the standard owner-only SELECT/INSERT/UPDATE/DELETE policies. '
  'Always use this instead of hand-writing policies: it guarantees UPDATE '
  'carries both USING and WITH CHECK.';

-- ---------------------------------------------------------------------------
-- Append-only policy set
-- ---------------------------------------------------------------------------

-- For tables whose whole purpose is preserving history — valuation snapshots
-- above all. Granting no UPDATE or DELETE policy at all means immutability is
-- enforced by the database, not by remembering not to write the mutation.
create or replace function app_private.apply_append_only_rls(target regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  tbl text := target::text;
begin
  execute format('alter table %s enable row level security', tbl);

  execute format(
    'create policy owner_select on %s for select to authenticated
       using (user_id = (select auth.uid()))', tbl);

  execute format(
    'create policy owner_insert on %s for insert to authenticated
       with check (user_id = (select auth.uid()))', tbl);

  -- Deliberately no UPDATE or DELETE policy. With RLS enabled and no
  -- permissive policy, those commands affect zero rows for every caller.
end;
$$;

comment on function app_private.apply_append_only_rls is
  'Applies SELECT + INSERT policies only, making the table append-only for '
  'all non-privileged callers. Used for historical records.';

-- ---------------------------------------------------------------------------
-- Audit: find user-owned tables that are not properly protected
-- ---------------------------------------------------------------------------

create or replace function app_private.audit_rls()
returns table (table_name text, problem text)
language sql
stable
set search_path = ''
as $$
  with owned as (
    -- Every public table carrying a user_id column is user-owned by definition.
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
  where not exists (
    select 1 from pg_policy p where p.polrelid = o.oid and p.polcmd = 'r'
  )

  union all
  select o.name, 'no INSERT policy'
  from owned o
  where not exists (
    select 1 from pg_policy p where p.polrelid = o.oid and p.polcmd = 'a'
  )

  union all
  -- The critical one: an UPDATE policy whose WITH CHECK is absent lets a user
  -- change row ownership. polwithcheck being null on an UPDATE policy is the
  -- signature of that bug.
  select o.name, 'UPDATE policy is missing WITH CHECK (ownership can be reassigned)'
  from owned o
  join pg_policy p on p.polrelid = o.oid and p.polcmd = 'w'
  where p.polwithcheck is null

  union all
  -- A user_id that can be null is an unowned row, which no policy can protect.
  select o.name, 'user_id is nullable'
  from owned o
  join pg_attribute a on a.attrelid = o.oid and a.attname = 'user_id'
  where not a.attnotnull
$$;

comment on function app_private.audit_rls is
  'Returns one row per RLS defect across user-owned public tables. '
  'A healthy schema returns zero rows; supabase/tests asserts exactly that.';
