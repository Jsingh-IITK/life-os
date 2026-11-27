-- 0016 — Plan versions, and recording a skipped training day.
--
-- "Missed" is never stored: fitness-core derives it from the plan, sessions
-- and conditioning (Consistency.classifyDay). Deriving it is only honest if
-- the plan a past day is judged against is the plan that applied on that
-- day. So plans become versions over date ranges, and a version that has
-- started can no longer be edited: changing the plan starts a new version.
--
-- Every function here is SECURITY INVOKER in public and calls nothing in
-- app_private (CLAUDE.md rule 6).

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Today, in the user's own timezone
-- ---------------------------------------------------------------------------

-- Period bucketing uses user_preferences.timezone, never the server clock's
-- UTC date: at 2am IST, UTC is still yesterday. Reads through the caller's
-- RLS. Falls back to UTC only if the preferences row is somehow missing.
create or replace function public.user_today()
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select p.timezone from public.user_preferences p where p.user_id = (select auth.uid())),
    'UTC'))::date;
$$;

revoke all on function public.user_today() from public, anon;
grant execute on function public.user_today() to authenticated;

-- ---------------------------------------------------------------------------
-- Plan versions
-- ---------------------------------------------------------------------------

alter table public.training_plans
  add column effective_from date,
  add column effective_to   date;

-- Existing plans began on the day they were created, in their owner's timezone.
update public.training_plans tp
set effective_from = (tp.created_at at time zone coalesce(
      (select p.timezone from public.user_preferences p where p.user_id = tp.user_id), 'UTC'))::date,
    effective_to = case when tp.is_active then null else
      (tp.updated_at at time zone coalesce(
        (select p.timezone from public.user_preferences p where p.user_id = tp.user_id), 'UTC'))::date
    end;

-- Guard the backfill above: an inactive plan closed the day it opened would
-- otherwise violate the range check below.
update public.training_plans
set effective_to = effective_from + 1
where effective_to is not null and effective_to <= effective_from;

alter table public.training_plans
  alter column effective_from set not null,
  -- New plans start today for their owner unless told otherwise.
  alter column effective_from set default public.user_today(),
  add constraint training_plans_range_valid
    check (effective_to is null or effective_to > effective_from),
  -- is_active stays (the client reads it) but can no longer disagree with the range.
  add constraint training_plans_active_is_open
    check (is_active = (effective_to is null)),
  -- Two versions covering the same day would make "what was planned" ambiguous.
  add constraint training_plans_no_overlap
    exclude using gist (
      user_id with =,
      daterange(effective_from, effective_to, '[)') with &&
    );

comment on column public.training_plans.effective_from is
  'First calendar day (user timezone) this version applies to.';
comment on column public.training_plans.effective_to is
  'Exclusive end. Null while this version is current.';

-- A version that has started is history. Its days cannot be added, changed or
-- removed; set_plan_day starts a new version instead. Enforced here rather
-- than by convention so a direct table write cannot rewrite the past either.
create or replace function public.guard_started_plan_days()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid := coalesce(new.plan_id, old.plan_id);
  v_from    date;
begin
  select tp.effective_from into v_from
  from public.training_plans tp
  where tp.id = v_plan_id;

  -- Deleting a whole plan cascades here after the plan row is gone; allow it.
  if not found then
    return coalesce(new, old);
  end if;

  if v_from < public.user_today() then
    raise exception 'this plan version started on %; change the plan from today with set_plan_day', v_from
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger training_plan_days_guard_started
before insert or update or delete on public.training_plan_days
for each row execute function public.guard_started_plan_days();

-- ---------------------------------------------------------------------------
-- Changing the plan from a date forward
-- ---------------------------------------------------------------------------

create or replace function public.set_plan_day(
  p_weekday     smallint,
  p_kind        public.session_kind,
  p_label       text,
  p_template_id uuid default null,
  p_from        date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid       uuid := (select auth.uid());
  v_today   date;
  v_from    date;
  v_current record;
  v_plan_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  v_today := public.user_today();
  v_from  := coalesce(p_from, v_today);

  if v_from < v_today then
    raise exception 'the plan can only change from today onwards; past days keep the plan they had'
      using errcode = 'check_violation';
  end if;

  if p_weekday is null or p_weekday not between 1 and 7 then
    raise exception 'weekday must be 1 (Monday) to 7 (Sunday)' using errcode = 'check_violation';
  end if;

  if nullif(trim(p_label), '') is null then
    raise exception 'a plan day needs a label' using errcode = 'not_null_violation';
  end if;

  -- A gym day is a template; any other day is not.
  if (p_kind = 'gym') <> (p_template_id is not null) then
    raise exception 'gym days need a workout template, and other days must not have one'
      using errcode = 'check_violation';
  end if;

  if p_template_id is not null and not exists (
    select 1 from public.workout_templates t where t.id = p_template_id and t.user_id = uid
  ) then
    raise exception 'workout template not found' using errcode = 'no_data_found';
  end if;

  select tp.id, tp.name, tp.effective_from into v_current
  from public.training_plans tp
  where tp.user_id = uid and tp.effective_to is null;

  if not found then
    raise exception 'no current plan; set up the programme first' using errcode = 'no_data_found';
  end if;

  if v_current.effective_from > v_from then
    raise exception 'a plan change is already scheduled from %; change from that date or later', v_current.effective_from
      using errcode = 'check_violation';
  end if;

  if v_current.effective_from = v_from then
    -- The current version starts on that very day: edit it in place.
    v_plan_id := v_current.id;
  else
    -- Close the current version and copy its days into a new one.
    update public.training_plans
    set effective_to = v_from, is_active = false
    where id = v_current.id;

    insert into public.training_plans (user_id, name, is_active, effective_from)
    values (uid, v_current.name, true, v_from)
    returning id into v_plan_id;

    insert into public.training_plan_days (user_id, plan_id, weekday, label, kind, template_id)
    select uid, v_plan_id, d.weekday, d.label, d.kind, d.template_id
    from public.training_plan_days d
    where d.plan_id = v_current.id and d.user_id = uid;
  end if;

  insert into public.training_plan_days (user_id, plan_id, weekday, label, kind, template_id)
  values (uid, v_plan_id, p_weekday, trim(p_label), p_kind, p_template_id)
  on conflict (plan_id, weekday) do update
    set label = excluded.label, kind = excluded.kind, template_id = excluded.template_id;

  return v_plan_id;
end;
$$;

comment on function public.set_plan_day is
  'Sets one weekday of the plan from a date (default today) forward. If the '
  'current version has already started, it is closed and a new version '
  'begins, so past days keep the plan they were judged against.';

revoke all on function public.set_plan_day(smallint, public.session_kind, text, uuid, date) from public, anon;
grant execute on function public.set_plan_day(smallint, public.session_kind, text, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Skipping a training day
-- ---------------------------------------------------------------------------

-- The existing unique key is (user_id, template_id, performed_on), and NULL
-- template ids never collide, so striking days need their own guard against
-- two diary entries for the same day.
create unique index workout_sessions_one_untemplated_per_day
  on public.workout_sessions (user_id, kind, coalesce(scheduled_for, performed_on))
  where template_id is null;

create or replace function public.skip_training_day(p_date date, p_reason text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid        uuid := (select auth.uid());
  v_day      record;
  v_existing record;
  v_id       uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if p_date is null then
    raise exception 'a skip needs a date' using errcode = 'not_null_violation';
  end if;

  -- The plan that applied on that date, not today's plan.
  select d.kind, d.label, d.template_id into v_day
  from public.training_plans tp
  join public.training_plan_days d on d.plan_id = tp.id and d.user_id = tp.user_id
  where tp.user_id = uid
    and p_date >= tp.effective_from
    and (tp.effective_to is null or p_date < tp.effective_to)
    and d.weekday = extract(isodow from p_date)::smallint;

  if not found then
    raise exception 'nothing was planned on %', p_date using errcode = 'no_data_found';
  end if;

  if v_day.kind in ('recovery', 'optional') then
    raise exception 'a % day cannot be skipped: it is never counted as missed', v_day.kind
      using errcode = 'check_violation';
  end if;

  if v_day.kind = 'striking' and exists (
    select 1 from public.conditioning_sessions c where c.user_id = uid and c.performed_on = p_date
  ) then
    raise exception 'training is already logged on %', p_date using errcode = 'check_violation';
  end if;

  select s.id, s.status into v_existing
  from public.workout_sessions s
  where s.user_id = uid
    and coalesce(s.scheduled_for, s.performed_on) = p_date
    and (case when v_day.template_id is null
              then s.template_id is null and s.kind = v_day.kind
              else s.template_id = v_day.template_id end)
  limit 1;

  if found then
    if v_existing.status = 'skipped' then
      return v_existing.id;
    end if;
    if v_existing.status = 'completed' or exists (
      select 1
      from public.workout_sets ws
      join public.workout_session_exercises wse on wse.id = ws.session_exercise_id and wse.user_id = ws.user_id
      where wse.session_id = v_existing.id and ws.user_id = uid
    ) then
      raise exception 'training is already logged on %; it cannot be marked skipped', p_date
        using errcode = 'check_violation';
    end if;

    -- Started but nothing logged: the session becomes the skip.
    update public.workout_sessions
    set status = 'skipped', notes = coalesce(nullif(trim(p_reason), ''), notes), ended_at = null
    where id = v_existing.id and user_id = uid;
    return v_existing.id;
  end if;

  insert into public.workout_sessions
    (user_id, template_id, name, kind, scheduled_for, performed_on, status, notes)
  values
    (uid, v_day.template_id, v_day.label, v_day.kind, p_date, p_date, 'skipped', nullif(trim(p_reason), ''))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.skip_training_day is
  'Records that the user chose not to train on a planned gym or striking day. '
  'Refused on rest and optional days, and once training is logged that day.';

revoke all on function public.skip_training_day(date, text) from public, anon;
grant execute on function public.skip_training_day(date, text) to authenticated;

create or replace function public.unskip_training_day(p_date date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid     uuid := (select auth.uid());
  removed integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  -- Only skips are removed. A started or completed session is never touched.
  delete from public.workout_sessions s
  where s.user_id = uid
    and s.status = 'skipped'
    and coalesce(s.scheduled_for, s.performed_on) = p_date;

  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.unskip_training_day is
  'Removes a skip for a date, returning how many were removed. Never touches '
  'a session that was started or completed.';

revoke all on function public.unskip_training_day(date) from public, anon;
grant execute on function public.unskip_training_day(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Starting a workout on a day that was skipped
-- ---------------------------------------------------------------------------

-- Redefines 0015's function. A skip and a session for the same template and
-- day share the diary's unique key, so 0015 would have returned the skip row,
-- with no exercises, as the "started" session. Training on the day is the
-- strongest evidence the skip no longer holds: the skip becomes the session.
create or replace function public.start_workout_session(
  p_template_id  uuid,
  p_performed_on date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid        uuid := (select auth.uid());
  tpl        record;
  existing   record;
  v_session_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if p_performed_on is null then
    raise exception 'a session needs a date' using errcode = 'not_null_violation';
  end if;

  select t.id, t.name, t.kind into tpl
  from public.workout_templates t
  where t.id = p_template_id and t.user_id = uid;

  if not found then
    raise exception 'workout template not found' using errcode = 'no_data_found';
  end if;

  select s.id, s.status into existing
  from public.workout_sessions s
  where s.user_id = uid and s.template_id = p_template_id and s.performed_on = p_performed_on;

  if found and existing.status <> 'skipped' then
    return existing.id;
  end if;

  if found then
    v_session_id := existing.id;
    update public.workout_sessions
    set status = 'in_progress', started_at = now(), ended_at = null
    where id = v_session_id and user_id = uid;
  else
    insert into public.workout_sessions
      (user_id, template_id, name, kind, scheduled_for, performed_on, status, started_at)
    values
      (uid, tpl.id, tpl.name, tpl.kind, p_performed_on, p_performed_on, 'in_progress', now())
    returning id into v_session_id;
  end if;

  -- The snapshot, unless this session already has one.
  if not exists (
    select 1 from public.workout_session_exercises e where e.session_id = v_session_id and e.user_id = uid
  ) then
    insert into public.workout_session_exercises
      (user_id, session_id, exercise_id, order_index, name_snapshot,
       target_sets, rep_min, rep_max, rest_seconds)
    select uid, v_session_id, wte.exercise_id, wte.order_index, e.name,
           wte.target_sets, wte.rep_min, wte.rep_max, wte.rest_seconds
    from public.workout_template_exercises wte
    join public.exercises e on e.id = wte.exercise_id and e.user_id = uid
    where wte.template_id = tpl.id and wte.user_id = uid;
  end if;

  return v_session_id;
end;
$$;
