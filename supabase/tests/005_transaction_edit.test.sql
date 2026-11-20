-- Editing and deleting transactions.
--
-- The claim being tested is that balances follow the postings automatically.
-- Nothing recalculates anything; changing a leg changes the balance because
-- the balance is the sum of the legs.

begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'editor@test.local', 'x'),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'intruder@test.local', 'x');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111"}';

insert into public.ledger_accounts (id, user_id, account_class, name)
values
  ('e0000001-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'ASSET',   'Bank'),
  ('e0000002-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'EXPENSE', 'Groceries'),
  ('e0000003-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'EXPENSE', 'Rent');

create or replace function pg_temp.bank_balance() returns bigint language sql stable as $f$
  select natural_balance from public.account_balances
  where ledger_account_id = 'e0000001-0000-0000-0000-000000000001';
$f$;

create or replace function pg_temp.spend_on(account uuid) returns bigint language sql stable as $f$
  select coalesce(natural_balance, 0) from public.account_balances
  where ledger_account_id = account;
$f$;

-- ₹500 of groceries.
select isnt(
  public.post_transaction($$ {
    "txn_date": "2026-11-21", "type": "expense", "merchant": "Corner shop",
    "postings": [
      {"ledger_account_id": "e0000002-0000-0000-0000-000000000002", "amount": 50000},
      {"ledger_account_id": "e0000001-0000-0000-0000-000000000001", "amount": -50000}
    ]
  } $$::jsonb),
  null,
  'the original expense posts'
);

select is(pg_temp.bank_balance(), (-50000)::bigint, 'bank is down ₹500');
select is(pg_temp.spend_on('e0000002-0000-0000-0000-000000000002'), 50000::bigint, 'groceries holds ₹500');

-- ---------------------------------------------------------------------------
-- Correcting the amount
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.update_transaction(
       (select id from public.transactions limit 1),
       $x$ {
         "txn_date": "2026-11-21", "type": "expense", "merchant": "Corner shop",
         "postings": [
           {"ledger_account_id": "e0000002-0000-0000-0000-000000000002", "amount": 65000},
           {"ledger_account_id": "e0000001-0000-0000-0000-000000000001", "amount": -65000}
         ]
       } $x$::jsonb) $$,
  'the amount can be corrected'
);

-- Nothing recalculated: the balance is the sum of the legs, which changed.
select is(pg_temp.bank_balance(), (-65000)::bigint, 'bank follows the corrected amount');
select is(pg_temp.spend_on('e0000002-0000-0000-0000-000000000002'), 65000::bigint, 'groceries follows too');

-- ---------------------------------------------------------------------------
-- Correcting the category
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.update_transaction(
       (select id from public.transactions limit 1),
       $x$ {
         "txn_date": "2026-11-21", "type": "expense", "merchant": "Landlord",
         "postings": [
           {"ledger_account_id": "e0000003-0000-0000-0000-000000000003", "amount": 65000},
           {"ledger_account_id": "e0000001-0000-0000-0000-000000000001", "amount": -65000}
         ]
       } $x$::jsonb) $$,
  'the category can be corrected'
);

select is(pg_temp.spend_on('e0000002-0000-0000-0000-000000000002'), 0::bigint, 'groceries is emptied');
select is(pg_temp.spend_on('e0000003-0000-0000-0000-000000000003'), 65000::bigint, 'rent now holds it');

-- An unbalanced correction must be refused, same as an unbalanced create.
-- The balance trigger is deferred, so the violation surfaces when constraints
-- are forced immediate rather than at the update itself.
savepoint before_bad_update;
select public.update_transaction(
  (select id from public.transactions limit 1),
  $x$ {
    "postings": [
      {"ledger_account_id": "e0000003-0000-0000-0000-000000000003", "amount": 65000},
      {"ledger_account_id": "e0000001-0000-0000-0000-000000000001", "amount": -1}
    ]
  } $x$::jsonb);

select throws_ok(
  $$ set constraints all immediate $$,
  23514,
  null,
  'an unbalanced correction is refused'
);
rollback to savepoint before_bad_update;
set constraints all deferred;

-- ---------------------------------------------------------------------------
-- Deleting
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.delete_transaction((select id from public.transactions limit 1)) $$,
  'a transaction can be deleted'
);

-- The postings still exist, but every aggregate filters deleted transactions,
-- so the balance returns to zero without the history being destroyed.
select is(pg_temp.bank_balance(), 0::bigint, 'a deleted transaction leaves no balance behind');

select is(
  (select count(*) from public.transaction_audit), 4::bigint,
  'every correction and the deletion are recorded'
);

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222"}';

select throws_ok(
  $$ select public.delete_transaction('00000000-0000-0000-0000-000000000000'::uuid) $$,
  'P0002',
  null,
  'another user cannot delete a transaction they cannot see'
);

select is(
  (select count(*) from public.transaction_audit), 0::bigint,
  'the audit trail is invisible to another user'
);

select * from finish();
rollback;
