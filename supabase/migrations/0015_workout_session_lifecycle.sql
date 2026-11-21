-- 0015 — Starting and completing a workout session.
--
-- Starting a session snapshots its template. Done from the client that is a
-- header insert followed by N exercise inserts, and a dropped connection in
-- between leaves a session with half its exercises. Done here it is one
-- statement's worth of transaction: all of the snapshot or none of it.
--
-- Both functions are SECURITY INVOKER in public and call nothing in
-- app_private (CLAUDE.md rule 6): every read and write goes through the
-- caller's own RLS.

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
  session_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if p_performed_on is null then
    raise exception 'a session needs a date' using errcode = 'not_null_violation';
  end if;

  -- RLS hides other users' templates, so "not found" covers "not yours".
  select t.id, t.name, t.kind into tpl
  from public.workout_templates t
  where t.id = p_template_id and t.user_id = uid;

  if not found then
    raise exception 'workout template not found' using errcode = 'no_data_found';
  end if;

  -- Re-opening today's workout returns the session already in the diary
  -- rather than creating a second one (or failing on the unique key).
  select s.id into session_id
  from public.workout_sessions s
  where s.user_id = uid and s.template_id = p_template_id and s.performed_on = p_performed_on;

  if found then
    return session_id;
  end if;

  insert into public.workout_sessions
    (user_id, template_id, name, kind, scheduled_for, performed_on, status, started_at)
  values
    (uid, tpl.id, tpl.name, tpl.kind, p_performed_on, p_performed_on, 'in_progress', now())
  returning id into session_id;

  -- The snapshot. After this the session never reads the template again.
  insert into public.workout_session_exercises
    (user_id, session_id, exercise_id, order_index, name_snapshot,
     target_sets, rep_min, rep_max, rest_seconds)
  select uid, session_id, wte.exercise_id, wte.order_index, e.name,
         wte.target_sets, wte.rep_min, wte.rep_max, wte.rest_seconds
  from public.workout_template_exercises wte
  join public.exercises e on e.id = wte.exercise_id and e.user_id = uid
  where wte.template_id = tpl.id and wte.user_id = uid;

  return session_id;
end;
$$;

comment on function public.start_workout_session is
  'Starts (or re-opens) the session for a template on a date, snapshotting the '
  'template atomically. Idempotent per template per day.';

revoke all on function public.start_workout_session(uuid, date) from public, anon;
grant execute on function public.start_workout_session(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.complete_workout_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid     uuid := (select auth.uid());
  current public.session_status;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select s.status into current
  from public.workout_sessions s
  where s.id = p_session_id and s.user_id = uid;

  if not found then
    raise exception 'workout session not found' using errcode = 'no_data_found';
  end if;

  if current <> 'in_progress' then
    raise exception 'only a session in progress can be completed (this one is %)', current
      using errcode = 'check_violation';
  end if;

  -- A completed session with nothing logged would count as training that
  -- never happened. Skipping is the honest record for that.
  if not exists (
    select 1
    from public.workout_sets ws
    join public.workout_session_exercises wse
      on wse.id = ws.session_exercise_id and wse.user_id = ws.user_id
    where wse.session_id = p_session_id and ws.user_id = uid
      and not ws.is_warmup and ws.reps > 0
  ) then
    raise exception 'log at least one working set before completing this session'
      using errcode = 'check_violation';
  end if;

  update public.workout_sessions
  set status = 'completed', ended_at = now()
  where id = p_session_id and user_id = uid;
end;
$$;

comment on function public.complete_workout_session is
  'Marks an in-progress session completed. Refuses a session with no working '
  'sets, so the diary cannot claim a workout that was not logged.';

revoke all on function public.complete_workout_session(uuid) from public, anon;
grant execute on function public.complete_workout_session(uuid) to authenticated;
