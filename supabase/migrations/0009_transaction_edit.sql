-- 0009 — Editing and deleting transactions.
--
-- Corrections amend the transaction in place and record what changed, rather
-- than posting a reversing entry. For personal finance the reversal approach
-- fills the history with pairs of entries the user never made and has to
-- mentally cancel; the audit row preserves the same information without
-- putting it in front of them.
--
-- Balances need no recalculation after either operation: they are derived from
-- postings, so changing the postings changes the balance by definition. That
-- is the whole reason no table stores one.

create table public.transaction_audit (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Deliberately not a foreign key: the audit must survive the transaction it
  -- describes, including a future hard delete.
  transaction_id uuid not null,

  action text not null
         constraint action_known check (action in ('update', 'delete', 'restore')),

  -- Full prior state, header and legs, so a correction is reconstructable.
  before jsonb not null,
  after  jsonb,

  created_at timestamptz not null default now(),

  constraint transaction_audit_user_id_id_key unique (user_id, id)
);

comment on table public.transaction_audit is
  'Append-only record of transaction corrections. Not FK-linked to '
  'transactions so it outlives them.';

-- Append-only: history that can be edited is not history.
select app_private.apply_append_only_rls('public.transaction_audit');
grant select, insert on public.transaction_audit to authenticated;

create index transaction_audit_user_txn_idx
  on public.transaction_audit (user_id, transaction_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Snapshot helper
-- ---------------------------------------------------------------------------

create or replace function app_private.snapshot_transaction(p_transaction_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'txn_date', t.txn_date,
    'type', t.type,
    'description', t.description,
    'merchant', t.merchant,
    'payment_method', t.payment_method,
    'notes', t.notes,
    'deleted_at', t.deleted_at,
    'postings', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'ledger_account_id', p.ledger_account_id,
                'amount', p.amount,
                'memo', p.memo) order by p.amount desc)
       from public.postings p where p.transaction_id = t.id),
      '[]'::jsonb)
  )
  from public.transactions t
  where t.id = p_transaction_id;
$$;

-- ---------------------------------------------------------------------------
-- Update
-- ---------------------------------------------------------------------------

-- Replaces a transaction's header and legs atomically.
--
-- SECURITY INVOKER: RLS decides whether this user may touch the row, and the
-- composite foreign keys still prevent pointing a leg at someone else's
-- account. A DEFINER version would bypass both.
create or replace function public.update_transaction(
  p_transaction_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  before jsonb;
  leg    jsonb;
  legs   integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  before := app_private.snapshot_transaction(p_transaction_id);
  if before is null then
    -- Either it does not exist or RLS hides it; both are "not yours".
    raise exception 'transaction not found' using errcode = 'no_data_found';
  end if;

  legs := jsonb_array_length(coalesce(payload -> 'postings', '[]'::jsonb));
  if legs < 2 then
    raise exception 'a transaction needs at least two postings, received %', legs
      using errcode = 'check_violation';
  end if;

  update public.transactions set
    txn_date       = coalesce((payload ->> 'txn_date')::date, txn_date),
    type           = coalesce((payload ->> 'type')::public.transaction_type, type),
    description    = nullif(payload ->> 'description', ''),
    merchant       = nullif(payload ->> 'merchant', ''),
    payment_method = nullif(payload ->> 'payment_method', '')::public.payment_method,
    notes          = nullif(payload ->> 'notes', '')
  where id = p_transaction_id;

  -- Replace the legs wholesale. The balance trigger is deferred, so the
  -- intermediate state with no postings is fine; only the state at COMMIT is
  -- judged.
  delete from public.postings where transaction_id = p_transaction_id;

  for leg in select * from jsonb_array_elements(payload -> 'postings')
  loop
    insert into public.postings (user_id, transaction_id, ledger_account_id, amount, memo)
    values (
      uid,
      p_transaction_id,
      (leg ->> 'ledger_account_id')::uuid,
      (leg ->> 'amount')::bigint,
      nullif(leg ->> 'memo', '')
    );
  end loop;

  insert into public.transaction_audit (user_id, transaction_id, action, before, after)
  values (uid, p_transaction_id, 'update', before,
          app_private.snapshot_transaction(p_transaction_id));

  return p_transaction_id;
end;
$$;

comment on function public.update_transaction is
  'Amends a transaction and its postings atomically, recording the prior '
  'state. Balances need no recalculation — they derive from the postings.';

-- ---------------------------------------------------------------------------
-- Delete and restore
-- ---------------------------------------------------------------------------

-- Soft delete. The postings remain, so the entry can be restored exactly; all
-- aggregate views already filter on deleted_at.
create or replace function public.delete_transaction(p_transaction_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  before jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  before := app_private.snapshot_transaction(p_transaction_id);
  if before is null then
    raise exception 'transaction not found' using errcode = 'no_data_found';
  end if;

  update public.transactions
     set deleted_at = now()
   where id = p_transaction_id and deleted_at is null;

  insert into public.transaction_audit (user_id, transaction_id, action, before, after)
  values (uid, p_transaction_id, 'delete', before,
          app_private.snapshot_transaction(p_transaction_id));

  return p_transaction_id;
end;
$$;

create or replace function public.restore_transaction(p_transaction_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  before jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  before := app_private.snapshot_transaction(p_transaction_id);
  if before is null then
    raise exception 'transaction not found' using errcode = 'no_data_found';
  end if;

  update public.transactions set deleted_at = null where id = p_transaction_id;

  insert into public.transaction_audit (user_id, transaction_id, action, before, after)
  values (uid, p_transaction_id, 'restore', before,
          app_private.snapshot_transaction(p_transaction_id));

  return p_transaction_id;
end;
$$;

revoke all on function public.update_transaction(uuid, jsonb) from public, anon;
revoke all on function public.delete_transaction(uuid) from public, anon;
revoke all on function public.restore_transaction(uuid) from public, anon;
grant execute on function public.update_transaction(uuid, jsonb) to authenticated;
grant execute on function public.delete_transaction(uuid) to authenticated;
grant execute on function public.restore_transaction(uuid) to authenticated;
