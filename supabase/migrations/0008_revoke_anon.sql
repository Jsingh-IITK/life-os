-- 0008 — Remove anon's access to user data.
--
-- Caught by the privilege audit added in 0007: the local Supabase stack
-- configures default privileges that grant anon SELECT on new public tables,
-- while the hosted project does not. So anon could read every table locally
-- and nothing in production — the two environments disagreed, and only one of
-- them was being tested.
--
-- Nothing in this application is public. An unauthenticated client has no
-- legitimate reason to open any of these tables, and relying on RLS alone to
-- return zero rows is weaker than not granting the privilege at all: a policy
-- mistake would then expose data that a missing grant would still refuse.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Stop future tables inheriting the same grant locally.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- post_transaction and onboard_finance are re-granted to authenticated only,
-- since the blanket function revoke above also stripped them.
grant execute on function public.post_transaction(jsonb) to authenticated;
grant execute on function public.onboard_finance(jsonb) to authenticated;

-- anon keeps USAGE on the schema: PostgREST needs it to resolve names before
-- auth is applied, and it conveys no access to any object by itself.
grant usage on schema public to anon;
