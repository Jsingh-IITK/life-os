-- Assistant action log: proposals are immutable, confirmation is atomic and
-- happens at most once, and nobody else can see or confirm them.

begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'asker@test.local', 'x'),
  ('ebbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'peeker@test.local', 'x');

select ok(
  not has_function_privilege('anon', 'public.confirm_ai_draft(uuid, jsonb)', 'execute'),
  'anon cannot confirm drafts'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

select public.onboard_finance('{}'::jsonb);

select set_config('test.food', (select id::text from public.ledger_accounts
  where account_class = 'EXPENSE' order by name limit 1), true);
select set_config('test.bank', (select id::text from public.ledger_accounts
  where account_class = 'ASSET' order by name limit 1), true);
select set_config('test.payload', jsonb_build_object(
  'txn_date', '2026-11-27', 'type', 'expense', 'merchant', 'Zomato', 'payment_method', 'upi',
  'postings', jsonb_build_array(
    jsonb_build_object('ledger_account_id', current_setting('test.food'), 'amount', 30000),
    jsonb_build_object('ledger_account_id', current_setting('test.bank'), 'amount', -30000)))::text, true);

insert into public.ai_action_logs (user_id, module, engine, input_text, proposal)
values ('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'finance', 'stub', 'zomato 300 upi', '{"intent":"record_expense"}');
select set_config('test.log1', (select id::text from public.ai_action_logs), true);

select throws_ok(
  $$ insert into public.ai_action_logs (user_id, module, engine, input_text, outcome)
     values ('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'finance', 'stub', 'x', 'invalid') $$,
  23514, null,
  'an invalid outcome must say why'
);

select throws_ok(
  $$ update public.ai_action_logs set proposal = '{"intent":"rewritten"}'
     where id = current_setting('test.log1')::uuid $$,
  23514, null,
  'a proposal cannot be edited after the fact'
);

-- Atomicity: a refused write leaves the log untouched.
select throws_ok(
  $$ select public.confirm_ai_draft(current_setting('test.log1')::uuid,
       jsonb_build_object('txn_date', '2026-11-27', 'type', 'expense', 'postings',
         jsonb_build_array(jsonb_build_object('ledger_account_id', current_setting('test.food'), 'amount', 30000)))) $$,
  23514, null,
  'a draft with one leg is refused by the normal write path'
);

select is(
  (select outcome::text || ':' || (transaction_id is null)::text
   from public.ai_action_logs where id = current_setting('test.log1')::uuid),
  'proposed:true',
  'a refused confirmation leaves the log proposed, with no transaction'
);

select lives_ok(
  $$ select public.confirm_ai_draft(current_setting('test.log1')::uuid, current_setting('test.payload')::jsonb) $$,
  'a valid draft is confirmed'
);

select is(
  (select l.outcome::text || ':' || (l.decided_at is not null)::text || ':' || t.idempotency_key
   from public.ai_action_logs l join public.transactions t on t.id = l.transaction_id
   where l.id = current_setting('test.log1')::uuid),
  'confirmed:true:ai:' || current_setting('test.log1'),
  'the log points at the transaction, which is keyed by the log'
);

select is(
  (select sum(p.amount)::bigint from public.postings p
   join public.ai_action_logs l on l.transaction_id = p.transaction_id
   where l.id = current_setting('test.log1')::uuid),
  0::bigint,
  'the confirmed transaction balances'
);

select throws_ok(
  $$ select public.confirm_ai_draft(current_setting('test.log1')::uuid, current_setting('test.payload')::jsonb) $$,
  23514, null,
  'a draft cannot be confirmed twice'
);

select is(
  (select count(*)::integer from public.transactions where idempotency_key like 'ai:%'), 1,
  'a repeated confirmation posts nothing more'
);

select throws_ok(
  $$ update public.ai_action_logs set outcome = 'dismissed', decided_at = now()
     where id = current_setting('test.log1')::uuid $$,
  23514, null,
  'a confirmed action cannot later be dismissed'
);

insert into public.ai_action_logs (user_id, module, engine, input_text, proposal)
values ('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'finance', 'stub', 'chai 40', '{"intent":"record_expense"}');
select set_config('test.log2', (select id::text from public.ai_action_logs where input_text = 'chai 40'), true);

select lives_ok(
  $$ update public.ai_action_logs set outcome = 'dismissed', decided_at = now()
     where id = current_setting('test.log2')::uuid $$,
  'a proposal can be dismissed'
);

select throws_ok(
  $$ select public.confirm_ai_draft(current_setting('test.log2')::uuid, current_setting('test.payload')::jsonb) $$,
  23514, null,
  'a dismissed proposal cannot be confirmed'
);

-- ---------------------------------------------------------------------------
-- Another user
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"ebbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

select is(
  (select count(*)::integer from public.ai_action_logs), 0,
  'another user cannot see someone else''s assistant history'
);

insert into public.ai_action_logs (user_id, module, engine, input_text)
values ('ebbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'finance', 'stub', 'spend 300');

select throws_ok(
  $$ select public.confirm_ai_draft(current_setting('test.log2')::uuid, current_setting('test.payload')::jsonb) $$,
  'P0002', null,
  'another user cannot confirm someone else''s proposal'
);

-- Their own proposal, but the victim's ledger accounts: the composite keys
-- refuse it inside the database.
select throws_ok(
  $$ select public.confirm_ai_draft(
       (select id from public.ai_action_logs where input_text = 'spend 300'),
       current_setting('test.payload')::jsonb) $$,
  23503, null,
  'a confirmed draft cannot post against another user''s accounts'
);

select * from finish();
rollback;
