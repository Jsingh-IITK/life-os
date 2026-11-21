-- Monthly income and spending.
--
-- The point of these assertions is what is excluded: transfers, card
-- repayments and investment purchases move money without being spending, and
-- realized capital gains are income in the ledger without being earnings.

begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values ('d4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'summary@test.local', 'x');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d4444444-4444-4444-4444-444444444444"}';

insert into public.ledger_accounts (id, user_id, account_class, name) values
  ('22220001-0000-0000-0000-000000000001', 'd4444444-4444-4444-4444-444444444444', 'ASSET',     'Bank'),
  ('22220002-0000-0000-0000-000000000002', 'd4444444-4444-4444-4444-444444444444', 'ASSET',     'Savings'),
  ('22220003-0000-0000-0000-000000000003', 'd4444444-4444-4444-4444-444444444444', 'LIABILITY', 'Card'),
  ('22220004-0000-0000-0000-000000000004', 'd4444444-4444-4444-4444-444444444444', 'EXPENSE',   'Groceries'),
  ('22220005-0000-0000-0000-000000000005', 'd4444444-4444-4444-4444-444444444444', 'INCOME',    'Salary'),
  ('22220006-0000-0000-0000-000000000006', 'd4444444-4444-4444-4444-444444444444', 'INCOME',    'Realized gains');

insert into public.categories (ledger_account_id, user_id, is_lifestyle) values
  ('22220005-0000-0000-0000-000000000005', 'd4444444-4444-4444-4444-444444444444', true),
  ('22220006-0000-0000-0000-000000000006', 'd4444444-4444-4444-4444-444444444444', false);

create or replace function pg_temp.income() returns bigint language sql stable as $f$
  select coalesce((select income from public.month_summary where period_month='2026-11-01'), 0);
$f$;
create or replace function pg_temp.expenses() returns bigint language sql stable as $f$
  select coalesce((select expenses from public.month_summary where period_month='2026-11-01'), 0);
$f$;
create or replace function pg_temp.gains() returns bigint language sql stable as $f$
  select coalesce((select realized_gains from public.month_summary where period_month='2026-11-01'), 0);
$f$;

select is(pg_temp.income(), 0::bigint, 'a month with nothing recorded reports zero income');

select public.post_transaction($$ {"txn_date":"2026-11-05","type":"income","postings":[
  {"ledger_account_id":"22220001-0000-0000-0000-000000000001","amount":12500000},
  {"ledger_account_id":"22220005-0000-0000-0000-000000000005","amount":-12500000}]} $$::jsonb);

select is(pg_temp.income(), 12500000::bigint, 'salary counts as income');

select public.post_transaction($$ {"txn_date":"2026-11-06","type":"expense","postings":[
  {"ledger_account_id":"22220004-0000-0000-0000-000000000004","amount":200000},
  {"ledger_account_id":"22220001-0000-0000-0000-000000000001","amount":-200000}]} $$::jsonb);

select is(pg_temp.expenses(), 200000::bigint, 'an expense counts as spending');

select public.post_transaction($$ {"txn_date":"2026-11-07","type":"transfer","postings":[
  {"ledger_account_id":"22220002-0000-0000-0000-000000000002","amount":5000000},
  {"ledger_account_id":"22220001-0000-0000-0000-000000000001","amount":-5000000}]} $$::jsonb);

select is(pg_temp.income(), 12500000::bigint, 'a transfer is not income');
select is(pg_temp.expenses(), 200000::bigint, 'a transfer is not spending');

select public.post_transaction($$ {"txn_date":"2026-11-08","type":"cc_repayment","postings":[
  {"ledger_account_id":"22220003-0000-0000-0000-000000000003","amount":300000},
  {"ledger_account_id":"22220001-0000-0000-0000-000000000001","amount":-300000}]} $$::jsonb);

select is(pg_temp.expenses(), 200000::bigint, 'a card repayment is not spending');

select public.post_transaction($$ {"txn_date":"2026-11-09","type":"investment_sell","postings":[
  {"ledger_account_id":"22220001-0000-0000-0000-000000000001","amount":600000},
  {"ledger_account_id":"22220002-0000-0000-0000-000000000002","amount":-500000},
  {"ledger_account_id":"22220006-0000-0000-0000-000000000006","amount":-100000}]} $$::jsonb);

select is(pg_temp.income(), 12500000::bigint, 'realized gains do not inflate monthly income');
select is(pg_temp.gains(), 100000::bigint, 'realized gains are reported separately');

select public.post_transaction($$ {"txn_date":"2026-12-01","type":"expense","postings":[
  {"ledger_account_id":"22220004-0000-0000-0000-000000000004","amount":900000},
  {"ledger_account_id":"22220001-0000-0000-0000-000000000001","amount":-900000}]} $$::jsonb);

select is(pg_temp.expenses(), 200000::bigint, 'spending in the next month stays there');

select * from finish();
rollback;
