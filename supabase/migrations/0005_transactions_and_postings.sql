-- 0005 — Transactions and postings: the double-entry ledger.
--
-- A transaction is a header plus two or more postings whose signed amounts sum
-- to zero. That single constraint is what turns the PRD's accounting rules from
-- conventions into structural facts:
--
--   transfer          DR Asset:Bank:B   CR Asset:Bank:A      — no EXPENSE leg exists
--   card purchase     DR Expense        CR Liability:Card
--   card repayment    DR Liability:Card CR Asset:Bank        — no EXPENSE leg exists
--   investment buy    DR Asset:Invest   CR Asset:Bank        — no EXPENSE leg exists
--   refund            DR Asset:Bank     CR Expense:<original>
--
-- A transfer cannot be counted as spending, and a card repayment cannot
-- double-count expenditure, because in neither case does an expense posting
-- exist to find. Nothing enforces that in application code; it is a property of
-- the data.

create type public.transaction_type as enum (
  'income',
  'expense',
  'transfer',
  'cc_purchase',
  'cc_repayment',
  'investment_buy',
  'investment_sell',
  'refund',
  'adjustment',
  'opening_balance'
);

create type public.payment_method as enum (
  'upi', 'credit_card', 'debit_card', 'cash', 'bank_transfer', 'other'
);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------

create table public.transactions (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- DATE, not timestamptz. A UTC timestamp moves a 31 March 11pm IST expense
  -- into April depending on the render path, silently corrupting "this month".
  txn_date date not null,

  type    public.transaction_type not null,
  description text,
  merchant    text,

  -- Nullable on purpose. NULL means "not stated" and must never be inferred;
  -- guessing a payment method invents a financial fact.
  payment_method public.payment_method,

  notes text,

  -- Refunds point at what they reverse, so a refund can default to the
  -- original's category and over-refunding can be detected.
  reverses_transaction_id uuid,

  -- Guards recurring-rule and AI double-submission.
  idempotency_key text,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint transactions_user_id_id_key unique (user_id, id),

  constraint transactions_reverses_fkey
    foreign key (user_id, reverses_transaction_id)
    references public.transactions (user_id, id)
    on delete set null,

  constraint transactions_idempotency_key_unique unique (user_id, idempotency_key)
);

comment on column public.transactions.payment_method is
  'NULL means unspecified. Never infer a payment method.';
comment on column public.transactions.deleted_at is
  'Soft delete. All aggregate views filter this out; history is preserved.';

select app_private.apply_user_rls('public.transactions');
select public.attach_updated_at('public.transactions');

-- Matches the dominant access path: one user''s history, newest first.
create index transactions_user_date_idx
  on public.transactions (user_id, txn_date desc, id desc)
  where deleted_at is null;

create index transactions_user_type_idx
  on public.transactions (user_id, type) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- postings
-- ---------------------------------------------------------------------------

create table public.postings (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null,

  transaction_id    uuid not null,
  ledger_account_id uuid not null,

  -- Signed, debit-positive. Natural balance is sum(amount) for ASSET/EXPENSE
  -- and -sum(amount) for LIABILITY/INCOME/EQUITY.
  amount public.paise not null
         constraint amount_not_zero check (amount <> 0),

  memo       text,
  created_at timestamptz not null default now(),

  constraint postings_user_id_id_key unique (user_id, id),

  -- These two composite foreign keys are the ownership guarantee, and they
  -- close a gap RLS cannot: foreign-key checks run as the table owner and
  -- BYPASS row security. Without user_id in the key, nothing stops a user
  -- attaching a posting to their own transaction while pointing it at someone
  -- else's ledger account, pulling that person's balance into their totals.
  constraint postings_transaction_fkey
    foreign key (user_id, transaction_id)
    references public.transactions (user_id, id)
    on delete cascade,

  constraint postings_account_fkey
    foreign key (user_id, ledger_account_id)
    references public.ledger_accounts (user_id, id)
    on delete restrict
);

comment on table public.postings is
  'Ledger legs. Signed debit-positive; every transaction''s legs sum to zero.';
comment on constraint postings_account_fkey on public.postings is
  'Composite FK including user_id: cross-user references fail in the database, '
  'independent of RLS, which does not apply to FK checks.';

select app_private.apply_user_rls('public.postings');

create index postings_user_account_idx on public.postings (user_id, ledger_account_id);
create index postings_transaction_idx  on public.postings (transaction_id);

-- ---------------------------------------------------------------------------
-- The balance guarantee
-- ---------------------------------------------------------------------------

create or replace function app_private.assert_transaction_balances()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  txn   uuid := coalesce(new.transaction_id, old.transaction_id);
  total bigint;
  legs  integer;
begin
  select coalesce(sum(amount), 0), count(*)
    into total, legs
  from public.postings
  where transaction_id = txn;

  -- Zero legs means the transaction's postings were all removed, which is a
  -- legitimate cascade during deletion rather than an imbalance.
  if legs = 0 then
    return null;
  end if;

  if legs < 2 then
    raise exception
      'transaction % has % posting(s): double-entry requires at least two',
      txn, legs
      using errcode = 'check_violation';
  end if;

  if total <> 0 then
    raise exception
      'transaction % postings sum to % paise; they must sum to 0',
      txn, total
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

-- DEFERRABLE INITIALLY DEFERRED is essential, not stylistic: a single posting
-- never balances on its own, so a non-deferred trigger would reject the first
-- leg of every multi-leg write before the second could be inserted. Deferring
-- to COMMIT lets the complete transaction be judged as a whole.
create constraint trigger postings_must_balance
  after insert or update or delete on public.postings
  deferrable initially deferred
  for each row execute function app_private.assert_transaction_balances();

-- ---------------------------------------------------------------------------
-- The only write path
-- ---------------------------------------------------------------------------

-- The Supabase client cannot open a multi-statement transaction, so inserting a
-- header and its legs from the client would leave a window where an unbalanced
-- transaction exists — or persist one permanently if the second insert failed.
-- This function performs the whole write server-side in one transaction.
--
-- SECURITY INVOKER (the default, stated explicitly) matters: it runs as the
-- caller, so RLS and the composite foreign keys both apply. A SECURITY DEFINER
-- version would bypass exactly the protections this schema relies on.
create or replace function public.post_transaction(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  txn_id uuid;
  leg    jsonb;
  legs   integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  legs := jsonb_array_length(coalesce(payload -> 'postings', '[]'::jsonb));
  if legs < 2 then
    raise exception 'a transaction needs at least two postings, received %', legs
      using errcode = 'check_violation';
  end if;

  -- user_id comes from the verified JWT. Any user_id in the payload is ignored
  -- rather than trusted.
  insert into public.transactions (
    user_id, txn_date, type, description, merchant,
    payment_method, notes, reverses_transaction_id, idempotency_key
  )
  values (
    uid,
    (payload ->> 'txn_date')::date,
    (payload ->> 'type')::public.transaction_type,
    nullif(payload ->> 'description', ''),
    nullif(payload ->> 'merchant', ''),
    nullif(payload ->> 'payment_method', '')::public.payment_method,
    nullif(payload ->> 'notes', ''),
    nullif(payload ->> 'reverses_transaction_id', '')::uuid,
    nullif(payload ->> 'idempotency_key', '')
  )
  returning id into txn_id;

  for leg in select * from jsonb_array_elements(payload -> 'postings')
  loop
    insert into public.postings (user_id, transaction_id, ledger_account_id, amount, memo)
    values (
      uid,
      txn_id,
      (leg ->> 'ledger_account_id')::uuid,
      (leg ->> 'amount')::bigint,
      nullif(leg ->> 'memo', '')
    );
  end loop;

  -- The deferred balance trigger fires at COMMIT; if the legs do not sum to
  -- zero the whole call is rolled back and nothing is persisted.
  return txn_id;
end;
$$;

comment on function public.post_transaction is
  'Atomically insert a transaction header and its balanced postings. The only '
  'supported write path. Runs as the caller so RLS applies; ignores any '
  'client-supplied user_id.';

revoke all on function public.post_transaction(jsonb) from public, anon;
grant execute on function public.post_transaction(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Derived balances
-- ---------------------------------------------------------------------------

-- security_invoker makes the view run with the querying user's permissions, so
-- the underlying RLS applies. Without it a view executes as its owner and
-- becomes a hole straight through row security.
create view public.account_balances
with (security_invoker = true)
as
select
  la.user_id,
  la.id            as ledger_account_id,
  la.account_class,
  la.name,
  la.parent_id,
  coalesce(sum(p.amount), 0)::bigint as debit_balance,
  (case
     when la.account_class in ('ASSET', 'EXPENSE') then coalesce(sum(p.amount), 0)
     else -coalesce(sum(p.amount), 0)
   end)::bigint as natural_balance
from public.ledger_accounts la
left join public.postings p
       on p.ledger_account_id = la.id
      and p.user_id = la.user_id
left join public.transactions t
       on t.id = p.transaction_id
      and t.user_id = p.user_id
      and t.deleted_at is null
where p.id is null or t.id is not null
group by la.user_id, la.id, la.account_class, la.name, la.parent_id;

comment on view public.account_balances is
  'Balance per account, derived from postings. No table stores a balance, so '
  'editing or deleting a transaction has nothing to recalculate and nothing '
  'that can drift out of agreement with the records.';
