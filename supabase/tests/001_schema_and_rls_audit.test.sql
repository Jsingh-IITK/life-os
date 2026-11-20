-- Schema-level guarantees: the money/measure domains behave, and every
-- user-owned table is actually protected.
--
-- The audit assertion is the important one. It is a standing guard rather than
-- a point-in-time check: any future table with a user_id column that ships
-- without RLS, without an INSERT policy, or with an UPDATE policy missing its
-- WITH CHECK will fail this test.

begin;
select plan(17);

-- ---------------------------------------------------------------------------
-- Domains
-- ---------------------------------------------------------------------------

select ok(
  exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public' and t.typname = 'paise'),
  'paise domain exists'
);

select ok(
  exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public' and t.typname = 'grams'),
  'grams domain exists'
);

select is(
  (select format_type(t.oid, null) from pg_type t
   join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'paise'),
  'paise',
  'paise is a distinct domain, not an alias for bigint'
);

select is(
  pg_typeof(1250::public.paise)::text, 'paise',
  'a value cast to paise keeps the domain type'
);

-- Money is signed: credits are negative in a debit-positive ledger.
select lives_ok(
  $$ select (-125075)::public.paise $$,
  'paise accepts negative amounts (credits)'
);

-- Measures are not.
select throws_ok(
  $$ select (-1)::public.grams $$,
  23514,
  null,
  'grams rejects negative values'
);

select throws_ok(
  $$ select (-1)::public.seconds $$,
  23514,
  null,
  'seconds rejects negative values'
);

-- ---------------------------------------------------------------------------
-- The standing RLS guarantee
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from app_private.audit_rls()),
  0::bigint,
  'no user-owned table has an RLS defect'
);

-- Spelled out, so a failure above is diagnosable from the output.
select is(
  (select coalesce(string_agg(table_name || ': ' || problem, '; '), 'none')
   from app_private.audit_rls()),
  'none',
  'RLS audit reports no problems'
);

-- ---------------------------------------------------------------------------
-- Write path and view exposure
-- ---------------------------------------------------------------------------

select ok(
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'post_transaction'),
  'post_transaction RPC exists'
);

-- SECURITY INVOKER, so RLS and the composite foreign keys apply to the caller.
-- A SECURITY DEFINER version here would bypass the schema's main protections.
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'post_transaction'),
  false,
  'post_transaction is SECURITY INVOKER, not DEFINER'
);

select ok(
  not has_function_privilege('anon', 'public.post_transaction(jsonb)', 'execute'),
  'anon cannot execute post_transaction'
);

select ok(
  has_function_privilege('authenticated', 'public.post_transaction(jsonb)', 'execute'),
  'authenticated can execute post_transaction'
);

-- A view without security_invoker runs as its owner and is a hole straight
-- through row security.
select ok(
  (select reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'account_balances')
  @> array['security_invoker=true'],
  'account_balances view uses security_invoker'
);

-- ---------------------------------------------------------------------------
-- Privileges. RLS decides which rows; it grants no access to the table itself.
-- Both are required, and the local stack's default privileges once masked the
-- absence of explicit grants — the hosted project had none, so every query
-- failed with "permission denied for table" in production while tests passed.
-- ---------------------------------------------------------------------------

select ok(
  has_table_privilege('authenticated', 'public.ledger_accounts', 'SELECT'),
  'authenticated can SELECT ledger_accounts'
);

select ok(
  not has_table_privilege('anon', 'public.ledger_accounts', 'SELECT'),
  'anon cannot SELECT ledger_accounts'
);

select ok(
  has_table_privilege('authenticated', 'public.account_balances', 'SELECT'),
  'authenticated can SELECT the account_balances view'
);

select * from finish();
rollback;
