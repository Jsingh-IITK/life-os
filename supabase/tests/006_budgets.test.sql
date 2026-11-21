-- Budgets: the plan, and what counts against it.
--
-- The claim under test is that only spending counts. A transfer, a card
-- repayment and an investment purchase all move money, and none of them
-- should touch a budget — not because the view filters them out, but because
-- they post no expense leg for it to find.

begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'budget@test.local', 'x');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c3333333-3333-3333-3333-333333333333"}';

insert into public.ledger_accounts (id, user_id, account_class, name) values
  ('11110001-0000-0000-0000-000000000001', 'c3333333-3333-3333-3333-333333333333', 'ASSET',     'Bank'),
  ('11110002-0000-0000-0000-000000000002', 'c3333333-3333-3333-3333-333333333333', 'ASSET',     'Savings'),
  ('11110003-0000-0000-0000-000000000003', 'c3333333-3333-3333-3333-333333333333', 'LIABILITY', 'Card'),
  ('11110004-0000-0000-0000-000000000004', 'c3333333-3333-3333-3333-333333333333', 'ASSET',     'Mutual funds'),
  ('11110005-0000-0000-0000-000000000005', 'c3333333-3333-3333-3333-333333333333', 'EXPENSE',   'Groceries');

insert into public.budgets (id, user_id, period_month)
values ('b0000001-0000-0000-0000-000000000001', 'c3333333-3333-3333-3333-333333333333', '2026-11-01');

insert into public.budget_allocations (user_id, budget_id, ledger_account_id, planned)
values ('c3333333-3333-3333-3333-333333333333', 'b0000001-0000-0000-0000-000000000001',
        '11110005-0000-0000-0000-000000000005', 500000);

create or replace function pg_temp.groceries_actual() returns bigint language sql stable as $f$
  select actual from public.budget_status
  where ledger_account_id = '11110005-0000-0000-0000-000000000005';
$f$;

select is(pg_temp.groceries_actual(), 0::bigint, 'a new allocation starts at zero spent');

-- A month must have one budget, or "the" budget is ambiguous.
select throws_ok(
  $$ insert into public.budgets (user_id, period_month)
     values ('c3333333-3333-3333-3333-333333333333', '2026-11-01') $$,
  23505, null, 'a month cannot have two budgets'
);

-- Allocating a category twice would let its spending count against both.
select throws_ok(
  $$ insert into public.budget_allocations (user_id, budget_id, ledger_account_id, planned)
     values ('c3333333-3333-3333-3333-333333333333', 'b0000001-0000-0000-0000-000000000001',
             '11110005-0000-0000-0000-000000000005', 100000) $$,
  23505, null, 'a category cannot be allocated twice in one month'
);

-- Budgeting an asset account is meaningless.
select throws_ok(
  $$ insert into public.budget_allocations (user_id, budget_id, ledger_account_id, planned)
     values ('c3333333-3333-3333-3333-333333333333', 'b0000001-0000-0000-0000-000000000001',
             '11110001-0000-0000-0000-000000000001', 100000) $$,
  'P0001', null, 'only expense categories can be budgeted'
);

-- ---------------------------------------------------------------------------
-- Spending counts
-- ---------------------------------------------------------------------------

select public.post_transaction($$ {
  "txn_date": "2026-11-10", "type": "expense",
  "postings": [
    {"ledger_account_id": "11110005-0000-0000-0000-000000000005", "amount": 120000},
    {"ledger_account_id": "11110001-0000-0000-0000-000000000001", "amount": -120000}
  ]} $$::jsonb);

select is(pg_temp.groceries_actual(), 120000::bigint, 'an expense counts against the budget');

-- ---------------------------------------------------------------------------
-- These must not count
-- ---------------------------------------------------------------------------

select public.post_transaction($$ {
  "txn_date": "2026-11-11", "type": "transfer",
  "postings": [
    {"ledger_account_id": "11110002-0000-0000-0000-000000000002", "amount": 2500000},
    {"ledger_account_id": "11110001-0000-0000-0000-000000000001", "amount": -2500000}
  ]} $$::jsonb);

select is(pg_temp.groceries_actual(), 120000::bigint, 'a transfer does not touch the budget');

select public.post_transaction($$ {
  "txn_date": "2026-11-12", "type": "cc_repayment",
  "postings": [
    {"ledger_account_id": "11110003-0000-0000-0000-000000000003", "amount": 300000},
    {"ledger_account_id": "11110001-0000-0000-0000-000000000001", "amount": -300000}
  ]} $$::jsonb);

select is(pg_temp.groceries_actual(), 120000::bigint, 'a card repayment does not touch the budget');

select public.post_transaction($$ {
  "txn_date": "2026-11-13", "type": "investment_buy",
  "postings": [
    {"ledger_account_id": "11110004-0000-0000-0000-000000000004", "amount": 500000},
    {"ledger_account_id": "11110001-0000-0000-0000-000000000001", "amount": -500000}
  ]} $$::jsonb);

select is(pg_temp.groceries_actual(), 120000::bigint, 'an investment purchase does not touch the budget');

-- ---------------------------------------------------------------------------
-- Period and lifecycle
-- ---------------------------------------------------------------------------

-- Next month's spending belongs to next month's budget.
select public.post_transaction($$ {
  "txn_date": "2026-12-02", "type": "expense",
  "postings": [
    {"ledger_account_id": "11110005-0000-0000-0000-000000000005", "amount": 90000},
    {"ledger_account_id": "11110001-0000-0000-0000-000000000001", "amount": -90000}
  ]} $$::jsonb);

select is(
  pg_temp.groceries_actual(), 120000::bigint,
  'spending outside the month is not counted'
);

-- A refund credits the same category, so it reduces the actual with no
-- special case anywhere.
select public.post_transaction($$ {
  "txn_date": "2026-11-14", "type": "refund",
  "postings": [
    {"ledger_account_id": "11110001-0000-0000-0000-000000000001", "amount": 20000},
    {"ledger_account_id": "11110005-0000-0000-0000-000000000005", "amount": -20000}
  ]} $$::jsonb);

select is(pg_temp.groceries_actual(), 100000::bigint, 'a refund reduces the actual');

-- Deleting an expense removes it from the budget.
select public.delete_transaction(
  (select t.id from public.transactions t
   join public.postings p on p.transaction_id = t.id
   where t.txn_date = '2026-11-10' limit 1));

select is(pg_temp.groceries_actual(), (-20000)::bigint,
  'deleting the expense leaves only the refund against the budget');

select * from finish();
rollback;
