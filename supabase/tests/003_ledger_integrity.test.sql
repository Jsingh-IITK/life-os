-- Ledger integrity: the balance guarantee and the accounting invariants.
--
-- These assert the structural claims directly against the database. A transfer
-- producing no expense posting is not a convention here — it is checked.
--
-- Note on `set constraints all immediate`: the balance trigger is DEFERRABLE
-- INITIALLY DEFERRED so it fires at COMMIT, which never happens inside a test
-- that rolls back. Forcing constraints immediate is what makes it observable.

begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values ('33333333-3333-3333-3333-333333333333',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'ledger@test.local', 'x');

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';

-- A minimal chart of accounts: two asset accounts, a card, an expense, income.
insert into public.ledger_accounts (id, user_id, account_class, name)
values
  ('c0000001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'ASSET',     'Bank'),
  ('c0000002-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'ASSET',     'Emergency Fund'),
  ('c0000003-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'LIABILITY', 'Credit Card'),
  ('c0000004-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'EXPENSE',   'Groceries'),
  ('c0000005-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'INCOME',    'Salary');

-- ---------------------------------------------------------------------------
-- The balance guarantee
-- ---------------------------------------------------------------------------

-- ₹300 groceries paid from the bank.
select isnt(
  public.post_transaction($$ {
    "txn_date": "2026-11-20", "type": "expense", "merchant": "Local store",
    "payment_method": "upi",
    "postings": [
      {"ledger_account_id": "c0000004-0000-0000-0000-000000000004", "amount": 30000},
      {"ledger_account_id": "c0000001-0000-0000-0000-000000000001", "amount": -30000}
    ]
  } $$::jsonb),
  null,
  'a balanced expense posts successfully'
);

select lives_ok(
  $$ set constraints all immediate $$,
  'the balanced transaction satisfies the deferred balance check'
);

-- Unbalanced legs must be refused.
savepoint before_unbalanced;
insert into public.transactions (id, user_id, txn_date, type)
values ('d0000001-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333', current_date, 'expense');
insert into public.postings (user_id, transaction_id, ledger_account_id, amount)
values
  ('33333333-3333-3333-3333-333333333333', 'd0000001-0000-0000-0000-000000000001',
   'c0000004-0000-0000-0000-000000000004', 30000),
  ('33333333-3333-3333-3333-333333333333', 'd0000001-0000-0000-0000-000000000001',
   'c0000001-0000-0000-0000-000000000001', -20000);  -- ₹100 short

select throws_ok(
  $$ set constraints all immediate $$,
  23514,
  null,
  'postings that do not sum to zero are rejected'
);
rollback to savepoint before_unbalanced;

-- A lone leg is not double-entry.
savepoint before_single_leg;
select throws_ok(
  $$ select public.post_transaction($x$ {
       "txn_date": "2026-11-20", "type": "expense",
       "postings": [{"ledger_account_id": "c0000004-0000-0000-0000-000000000004", "amount": 30000}]
     } $x$::jsonb) $$,
  23514,
  null,
  'a single-posting transaction is refused'
);
rollback to savepoint before_single_leg;

-- Zero-amount legs carry no information and are refused.
select throws_ok(
  $$ insert into public.postings (user_id, transaction_id, ledger_account_id, amount)
     values ('33333333-3333-3333-3333-333333333333',
             (select id from public.transactions limit 1),
             'c0000004-0000-0000-0000-000000000004', 0) $$,
  23514,
  null,
  'a zero-amount posting is refused'
);

-- ---------------------------------------------------------------------------
-- The accounting invariants
-- ---------------------------------------------------------------------------

-- Helper: total spend = everything posted to EXPENSE accounts.
create or replace function pg_temp.total_spend()
returns bigint language sql stable as $$
  select coalesce(sum(p.amount), 0)::bigint
  from public.postings p
  join public.ledger_accounts la on la.id = p.ledger_account_id
  join public.transactions t on t.id = p.transaction_id and t.deleted_at is null
  where la.account_class = 'EXPENSE';
$$;

select is(pg_temp.total_spend(), 30000::bigint, 'spend so far is the ₹300 of groceries');

-- Transfer ₹10,000 bank → emergency fund.
select isnt(
  public.post_transaction($$ {
    "txn_date": "2026-11-20", "type": "transfer",
    "postings": [
      {"ledger_account_id": "c0000002-0000-0000-0000-000000000002", "amount": 1000000},
      {"ledger_account_id": "c0000001-0000-0000-0000-000000000001", "amount": -1000000}
    ]
  } $$::jsonb),
  null,
  'a transfer posts successfully'
);

-- The invariant: a transfer touches no EXPENSE account, so it cannot register
-- as spending. There is no expense leg to find.
select is(
  pg_temp.total_spend(), 30000::bigint,
  'a transfer does not increase expenditure'
);

-- Card purchase ₹2,000: expense recognised now, liability increases.
select isnt(
  public.post_transaction($$ {
    "txn_date": "2026-11-20", "type": "cc_purchase",
    "postings": [
      {"ledger_account_id": "c0000004-0000-0000-0000-000000000004", "amount": 200000},
      {"ledger_account_id": "c0000003-0000-0000-0000-000000000003", "amount": -200000}
    ]
  } $$::jsonb),
  null,
  'a card purchase posts successfully'
);

select is(
  pg_temp.total_spend(), 230000::bigint,
  'a card purchase is expenditure at the time of purchase'
);

-- Repaying the card ₹2,000: settles the liability from the bank.
select isnt(
  public.post_transaction($$ {
    "txn_date": "2026-11-25", "type": "cc_repayment",
    "postings": [
      {"ledger_account_id": "c0000003-0000-0000-0000-000000000003", "amount": 200000},
      {"ledger_account_id": "c0000001-0000-0000-0000-000000000001", "amount": -200000}
    ]
  } $$::jsonb),
  null,
  'a card repayment posts successfully'
);

-- The invariant that matters most: repayment must not double-count. Again,
-- structurally — the repayment has no expense leg.
select is(
  pg_temp.total_spend(), 230000::bigint,
  'a card repayment does not duplicate expenditure'
);

-- And the card is now settled.
select is(
  (select natural_balance from public.account_balances
   where ledger_account_id = 'c0000003-0000-0000-0000-000000000003'),
  0::bigint,
  'the credit card liability is back to zero after repayment'
);

select * from finish();
rollback;
