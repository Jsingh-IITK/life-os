-- 0017 — The assistant's action log.
--
-- Every proposal the assistant makes is recorded with what produced it and
-- what became of it. The model proposes; the user confirms; the existing
-- post_transaction path writes. The log is how that chain stays auditable.
--
-- confirm_ai_draft writes the transaction and marks the log in one database
-- transaction, keyed by the log id, so a double tap cannot post twice.
-- SECURITY INVOKER in public; calls nothing in app_private (CLAUDE.md rule 6).

create type public.ai_outcome as enum ('proposed', 'invalid', 'confirmed', 'dismissed');

create table public.ai_action_logs (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- One module per request: the router's decision, recorded.
  module  text not null constraint ai_module_known check (module in ('finance', 'fitness')),
  engine  text not null constraint ai_engine_known check (engine in ('stub', 'gemini')),
  model   text,

  input_text text not null constraint ai_input_bounded check (char_length(input_text) between 1 and 1000),
  -- Exactly what the engine returned, before validation. Never edited.
  proposal   jsonb,
  -- Why validation refused it, when it did.
  invalid_reason text,

  outcome        public.ai_outcome not null default 'proposed',
  transaction_id uuid,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),

  constraint ai_action_logs_user_id_id_key unique (user_id, id),
  constraint ai_action_logs_transaction_fkey
    foreign key (user_id, transaction_id) references public.transactions (user_id, id)
    on delete set null (transaction_id),
  constraint ai_invalid_has_reason check ((outcome = 'invalid') = (invalid_reason is not null)),
  constraint ai_decided_has_time check ((outcome in ('confirmed', 'dismissed')) = (decided_at is not null))
);

select app_private.apply_user_rls('public.ai_action_logs');
grant select, insert, update, delete on public.ai_action_logs to authenticated;

create index ai_action_logs_user_created_idx on public.ai_action_logs (user_id, created_at desc);

comment on table public.ai_action_logs is
  'Every assistant proposal, its engine and its outcome. Proposals are immutable; '
  'a decided row (confirmed or dismissed) cannot change.';

-- A log that can be rewritten is not a log. Only proposed → confirmed or
-- dismissed is allowed, and only the outcome fields may change.
create or replace function public.guard_ai_action_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.outcome <> 'proposed' then
    raise exception 'this assistant action was already %', old.outcome using errcode = 'check_violation';
  end if;

  if new.outcome not in ('confirmed', 'dismissed') then
    raise exception 'a proposal can only be confirmed or dismissed' using errcode = 'check_violation';
  end if;

  if (new.module, new.engine, new.model, new.input_text, new.proposal, new.invalid_reason, new.created_at)
     is distinct from
     (old.module, old.engine, old.model, old.input_text, old.proposal, old.invalid_reason, old.created_at) then
    raise exception 'an assistant proposal cannot be edited' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger ai_action_logs_guard
before update on public.ai_action_logs
for each row execute function public.guard_ai_action_log();

-- ---------------------------------------------------------------------------

create or replace function public.confirm_ai_draft(p_log_id uuid, p_transaction jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  v_log  record;
  v_txn  uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select l.id, l.outcome, l.module into v_log
  from public.ai_action_logs l
  where l.id = p_log_id and l.user_id = uid
  for update;

  if not found then
    raise exception 'assistant action not found' using errcode = 'no_data_found';
  end if;

  if v_log.outcome <> 'proposed' then
    raise exception 'this assistant action was already %', v_log.outcome using errcode = 'check_violation';
  end if;

  if v_log.module <> 'finance' then
    raise exception 'only finance drafts can be confirmed as transactions' using errcode = 'check_violation';
  end if;

  -- The same write path as manual entry: balanced legs or nothing. The key
  -- ties the transaction to this proposal, so it can exist at most once.
  v_txn := public.post_transaction(
    p_transaction || jsonb_build_object('idempotency_key', 'ai:' || p_log_id::text)
  );

  update public.ai_action_logs
  set outcome = 'confirmed', transaction_id = v_txn, decided_at = now()
  where id = p_log_id and user_id = uid;

  return v_txn;
end;
$$;

comment on function public.confirm_ai_draft is
  'Saves the confirmed draft through post_transaction and marks the log '
  'confirmed, atomically. Idempotency key ai:<log id> makes a repeat impossible.';

revoke all on function public.confirm_ai_draft(uuid, jsonb) from public, anon;
grant execute on function public.confirm_ai_draft(uuid, jsonb) to authenticated;
