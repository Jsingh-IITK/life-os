-- Onboarding: the chart of accounts a new user starts with.
--
-- The important assertions are about what is *absent*: no amounts posted, no
-- EMI expense category, and no second user's data reachable.

begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'onboard@test.local', 'x'),
  ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'other@test.local', 'x');

set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777"}';

select is(
  (select count(*) from public.ledger_accounts), 0::bigint,
  'a new user starts with no accounts at all'
);

select lives_ok(
  $$ select public.onboard_finance('{"bank_name":"HDFC Savings","with_card":true,"with_investments":true,"expected_income":12500000}'::jsonb) $$,
  'onboarding runs'
);

select is(
  (select count(*) from public.ledger_accounts), 21::bigint,
  'creates the full chart: 1 equity + 1 bank + 1 card + 3 investments + 2 income + 14 expense'
);

-- The money must not move. Onboarding describes structure, not history.
select is(
  (select count(*) from public.postings), 0::bigint,
  'onboarding posts no amounts — opening balances are an explicit choice'
);

select is(
  (select count(*) from public.transactions), 0::bigint,
  'onboarding creates no transactions'
);

-- The decision recorded in D11 and the card-EMI answer.
select is(
  (select count(*) from public.ledger_accounts la
   where la.account_class = 'EXPENSE' and la.name ilike '%EMI%'),
  0::bigint,
  'no EMI expense category: repaying a card is not spending'
);

select is(
  (select count(*) from public.ledger_accounts where account_class = 'EXPENSE'),
  14::bigint,
  'fourteen expense categories (ten committed plus four discretionary)'
);

select is(
  (select account_class from public.ledger_accounts where name = 'Credit card'),
  'LIABILITY'::public.account_class,
  'the credit card is a liability, not an asset'
);

-- Realized gains must not inflate monthly income.
select is(
  (select c.is_lifestyle from public.categories c
   join public.ledger_accounts la on la.id = c.ledger_account_id
   where la.name = 'Realized capital gains'),
  false,
  'realized gains are marked not-lifestyle income'
);

select is(
  (select payroll_mode::text from public.income_sources where name = 'Salary'),
  'net',
  'salary defaults to net payroll mode'
);

-- Running it twice must not duplicate the chart of accounts.
select throws_ok(
  $$ select public.onboard_finance('{}'::jsonb) $$,
  23505,
  null,
  'onboarding refuses to run twice'
);

-- Isolation: the second user sees nothing of the first's chart of accounts.
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888"}';

select is(
  (select count(*) from public.ledger_accounts), 0::bigint,
  'another user sees none of it'
);

select * from finish();
rollback;
