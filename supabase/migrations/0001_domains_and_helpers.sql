-- 0001 — Money and measure domains, plus shared helpers.
--
-- This migration deliberately creates no tables. It establishes the primitives
-- every later table depends on, so that the no-floating-point rule is enforced
-- by the column type rather than by convention in application code.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Monetary precision
-- ---------------------------------------------------------------------------

-- Integer paise. Signed, because postings use a debit-positive convention
-- where credits are negative and every transaction's legs must sum to zero.
create domain public.paise as bigint;

comment on domain public.paise is
  'Monetary amount in whole paise (1/100 rupee). Signed: debit-positive. '
  'Never store rupees as numeric/float — ₹0.01 is not representable in binary '
  'floating point. Read in TypeScript via @life-os/finance-core Money.fromDatabase().';

-- ---------------------------------------------------------------------------
-- Training measures — same discipline, different domain
-- ---------------------------------------------------------------------------

-- Whole grams. Training volume sums (weight × reps) over thousands of sets,
-- and plate increments are fractional in kilograms (2.5kg, 1.25kg), so the
-- drift problem is identical to money.
create domain public.grams as bigint
  constraint grams_non_negative check (value is null or value >= 0);

comment on domain public.grams is
  'Mass in whole grams (60kg = 60000). Non-negative. Read via '
  '@life-os/fitness-core Measures.';

-- Whole seconds, for session and rest durations.
create domain public.seconds as integer
  constraint seconds_non_negative check (value is null or value >= 0);

comment on domain public.seconds is 'Duration in whole seconds. Non-negative.';

-- Whole metres, for cardio distance.
create domain public.metres as integer
  constraint metres_non_negative check (value is null or value >= 0);

comment on domain public.metres is 'Distance in whole metres. Non-negative.';

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Maintains updated_at on any table with that column.
-- search_path is pinned empty: a SECURITY DEFINER or widely-attached function
-- with a mutable search_path can be hijacked by a shadowing object.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Trigger function: stamps updated_at on UPDATE. Attach via attach_updated_at().';

-- Convenience: attach the updated_at trigger to a table by name.
create or replace function public.attach_updated_at(target_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create trigger set_updated_at before update on %s
       for each row execute function public.set_updated_at()',
    target_table
  );
end;
$$;

comment on function public.attach_updated_at is
  'Attaches the standard updated_at trigger to the given table.';
