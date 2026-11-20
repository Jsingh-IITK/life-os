-- Cross-user isolation, tested with two real users.
--
-- These cover the PRD's security acceptance criteria: a user cannot read
-- another's records, cannot reassign ownership of their own record, and cannot
-- reach another user's data by manipulating a foreign key — the last being the
-- case RLS alone does *not* prevent, because foreign-key checks execute as the
-- table owner and bypass row security.

begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- Two users. Inserting into auth.users fires the provisioning trigger.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@test.local', 'x'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@test.local', 'x');

-- Provisioning should have happened without any manual work.
select is(
  (select count(*) from public.profiles
   where user_id in ('11111111-1111-1111-1111-111111111111',
                     '22222222-2222-2222-2222-222222222222')),
  2::bigint,
  'signup provisions a profile for each user'
);

select is(
  (select count(*) from public.module_preferences
   where user_id = '11111111-1111-1111-1111-111111111111'),
  2::bigint,
  'signup enables the finance and fitness modules'
);

-- No financial configuration is seeded globally.
select is(
  (select count(*) from public.ledger_accounts),
  0::bigint,
  'signup seeds no accounts — financial config is per-user onboarding, not a default'
);

-- ---------------------------------------------------------------------------
-- Helper: act as a given user
-- ---------------------------------------------------------------------------

create or replace function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  execute format('set local role authenticated');
  execute format('set local request.jwt.claims = %L', json_build_object('sub', uid)::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Alice creates her chart of accounts
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select is(
  (select auth.uid()), '11111111-1111-1111-1111-111111111111'::uuid,
  'auth.uid() reflects the acting user'
);

insert into public.ledger_accounts (id, user_id, account_class, name)
values
  ('aaaa0001-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'ASSET', 'HDFC Savings'),
  ('aaaa0002-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', 'EXPENSE', 'Groceries');

select is(
  (select count(*) from public.ledger_accounts), 2::bigint,
  'Alice sees her own two accounts'
);

-- Cannot create a row owned by someone else.
select throws_ok(
  $$ insert into public.ledger_accounts (user_id, account_class, name)
     values ('22222222-2222-2222-2222-222222222222', 'ASSET', 'Planted in Bob''s books') $$,
  42501,
  null,
  'Alice cannot insert a row owned by Bob'
);

-- ---------------------------------------------------------------------------
-- Bob is blind to Alice's data
-- ---------------------------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select is(
  (select count(*) from public.ledger_accounts), 0::bigint,
  'Bob cannot read Alice''s accounts'
);

select is(
  (select count(*) from public.profiles), 1::bigint,
  'Bob sees only his own profile'
);

-- The foreign-key attack: Bob owns this row, so RLS is satisfied, but the
-- account it points at is Alice's. Only the composite FK stops this.
insert into public.transactions (id, user_id, txn_date, type)
values ('bbbb0001-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', current_date, 'expense');

select throws_ok(
  $$ insert into public.postings (user_id, transaction_id, ledger_account_id, amount)
     values ('22222222-2222-2222-2222-222222222222',
             'bbbb0001-0000-0000-0000-000000000001',
             'aaaa0001-0000-0000-0000-000000000001', 50000) $$,
  23503,
  null,
  'Bob cannot post to Alice''s account — composite FK rejects it as a FK violation'
);

-- ---------------------------------------------------------------------------
-- Ownership cannot be reassigned
-- ---------------------------------------------------------------------------

-- This is the bug that a UPDATE policy without WITH CHECK allows: Bob owns the
-- row and may update it, but he must not be able to leave it owned by Alice.
select throws_ok(
  $$ update public.transactions
       set user_id = '11111111-1111-1111-1111-111111111111'
     where id = 'bbbb0001-0000-0000-0000-000000000001' $$,
  42501,
  null,
  'Bob cannot reassign his own record to Alice'
);

select is(
  (select user_id from public.transactions
   where id = 'bbbb0001-0000-0000-0000-000000000001'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'the record is still owned by Bob'
);

-- Updating someone else's row matches nothing rather than erroring.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

-- A data-modifying CTE is only legal at the top level, so row_count is
-- captured in a function rather than a subquery.
create or replace function pg_temp.try_tamper()
returns bigint language plpgsql as $f$
declare affected bigint;
begin
  update public.transactions set description = 'tampered'
  where id = 'bbbb0001-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  return affected;
end;
$f$;

select is(
  pg_temp.try_tamper(), 0::bigint,
  'Alice''s update of Bob''s row affects zero rows'
);

select * from finish();
rollback;
