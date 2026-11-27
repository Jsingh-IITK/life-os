-- Fitness: plan versions keep history honest; skipping is explicit and bounded.
--
-- user_today() follows the real clock, so every date below is computed from
-- it rather than written as a literal.

begin;
select plan(31);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('e8888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'planner@test.local', 'x'),
  ('e9999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'snoop@test.local', 'x');

select ok(
  not has_function_privilege('anon', 'public.skip_training_day(date, text)', 'execute')
  and not has_function_privilege('anon', 'public.unskip_training_day(date)', 'execute')
  and not has_function_privilege('anon', 'public.set_plan_day(smallint, public.session_kind, text, uuid, date)', 'execute')
  and not has_function_privilege('anon', 'public.user_today()', 'execute'),
  'anon can execute none of the plan or skip functions'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"e8888888-8888-8888-8888-888888888888"}';

select is(
  public.user_today(),
  (now() at time zone 'Asia/Kolkata')::date,
  'today is the calendar date in the user''s timezone, not UTC'
);

select lives_ok($$ select public.seed_training_programme() $$, 'the programme seeds');

select is(
  (select effective_from::text || ':' || coalesce(effective_to::text, 'open') from public.training_plans),
  public.user_today()::text || ':open',
  'a new plan starts today and is open-ended'
);

-- ---------------------------------------------------------------------------
-- The plan's integrity is structural
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.training_plans (user_id, name) values
       ('e8888888-8888-8888-8888-888888888888', 'Overlapping') $$,
  '23P01', null,
  'two plan versions cannot cover the same day'
);

select throws_ok(
  $$ update public.training_plans set is_active = false $$,
  23514, null,
  'is_active cannot disagree with the date range'
);

-- Pretend the plan began a week ago, so it is now history.
update public.training_plans set effective_from = public.user_today() - 7;

select throws_ok(
  $$ update public.training_plan_days set label = 'Rewritten' where weekday = 2 $$,
  23514, null,
  'a started plan version cannot be edited directly'
);

select throws_ok(
  $$ delete from public.training_plan_days where weekday = 2 $$,
  23514, null,
  'a started plan version cannot have days removed'
);

-- ---------------------------------------------------------------------------
-- Changing the plan starts a new version
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.set_plan_day(2::smallint, 'recovery', 'Rest', null, public.user_today() - 1) $$,
  23514, null,
  'the plan cannot be changed for past days'
);

select throws_ok(
  $$ select public.set_plan_day(2::smallint, 'gym', 'Push', null) $$,
  23514, null,
  'a gym day needs a template'
);

select throws_ok(
  $$ select public.set_plan_day(2::smallint, 'recovery', 'Rest',
       (select id from public.workout_templates where name = 'Push')) $$,
  23514, null,
  'a non-gym day cannot carry a template'
);

select lives_ok(
  $$ select public.set_plan_day(2::smallint, 'recovery', 'Rest') $$,
  'changing Tuesday to rest from today succeeds'
);

select is(
  (select count(*)::integer from public.training_plans), 2,
  'the change created a second version'
);

select is(
  (select effective_to from public.training_plans where effective_from = public.user_today() - 7),
  public.user_today(),
  'the old version now ends today'
);

select is(
  (select d.kind::text from public.training_plan_days d
     join public.training_plans tp on tp.id = d.plan_id
   where tp.effective_from = public.user_today() - 7 and d.weekday = 2),
  'gym',
  'the old version still says Tuesday was a gym day'
);

select is(
  (select count(*)::integer || ':' || bool_or(d.weekday = 2 and d.kind = 'recovery')::text
   from public.training_plan_days d
   join public.training_plans tp on tp.id = d.plan_id
   where tp.effective_to is null),
  '7:true',
  'the new version has all seven days with Tuesday as rest'
);

select lives_ok(
  $$ select public.set_plan_day(4::smallint, 'recovery', 'Rest') $$,
  'a second change on the same day edits the new version in place'
);

select is(
  (select count(*)::integer from public.training_plans), 2,
  'editing the version that starts today does not create another'
);

-- ---------------------------------------------------------------------------
-- Skipping, judged against the plan that applied on that day
-- ---------------------------------------------------------------------------

-- The most recent past Tuesday (a Push day under the old version) and Monday
-- (a striking day), both within the old version's week.
select set_config('test.past_tue',
  (public.user_today() - 7 + ((2 - extract(isodow from public.user_today() - 7)::int + 7) % 7))::text, true);
select set_config('test.past_mon',
  (public.user_today() - 7 + ((1 - extract(isodow from public.user_today() - 7)::int + 7) % 7))::text, true);
select set_config('test.past_sun',
  (public.user_today() - 7 + ((7 - extract(isodow from public.user_today() - 7)::int + 7) % 7))::text, true);

select lives_ok(
  $$ select public.skip_training_day(current_setting('test.past_tue')::date, 'travelling') $$,
  'a past gym day can be marked skipped'
);

select is(
  (select s.status::text || ':' || t.name || ':' || s.notes
   from public.workout_sessions s join public.workout_templates t on t.id = s.template_id
   where s.scheduled_for = current_setting('test.past_tue')::date),
  'skipped:Push:travelling',
  'the skip records the planned template and the reason'
);

select is(
  public.skip_training_day(current_setting('test.past_tue')::date),
  (select id from public.workout_sessions where scheduled_for = current_setting('test.past_tue')::date),
  'skipping twice returns the same entry'
);

select throws_ok(
  $$ select public.skip_training_day(current_setting('test.past_sun')::date) $$,
  23514, null,
  'a rest day cannot be skipped'
);

-- Training on a skipped day replaces the skip with a real session.
select is(
  public.start_workout_session(
    (select id from public.workout_templates where name = 'Push'),
    current_setting('test.past_tue')::date),
  (select id from public.workout_sessions where scheduled_for = current_setting('test.past_tue')::date),
  'starting a workout on a skipped day reuses that diary entry'
);

select is(
  (select s.status::text || ':' || count(e.id)::text
   from public.workout_sessions s
   left join public.workout_session_exercises e on e.session_id = s.id
   where s.scheduled_for = current_setting('test.past_tue')::date
   group by s.status),
  'in_progress:6',
  'the reused entry is in progress with the template snapshotted'
);

insert into public.workout_sets (user_id, session_exercise_id, set_index, weight_grams, reps)
select 'e8888888-8888-8888-8888-888888888888', e.id, 1, 22500, 8
from public.workout_session_exercises e
join public.workout_sessions s on s.id = e.session_id
where s.scheduled_for = current_setting('test.past_tue')::date
order by e.order_index limit 1;

select throws_ok(
  $$ select public.skip_training_day(current_setting('test.past_tue')::date) $$,
  23514, null,
  'a day with logged sets cannot be marked skipped'
);

select is(
  public.unskip_training_day(current_setting('test.past_tue')::date), 0,
  'unskip never removes a session that was started'
);

-- Striking days have no template; their skips need their own uniqueness.
select lives_ok(
  $$ select public.skip_training_day(current_setting('test.past_mon')::date) $$,
  'a past striking day can be marked skipped'
);

select is(
  public.unskip_training_day(current_setting('test.past_mon')::date), 1,
  'unskip removes the striking-day skip'
);

insert into public.conditioning_sessions (user_id, performed_on, activity, duration_seconds)
values ('e8888888-8888-8888-8888-888888888888', current_setting('test.past_mon')::date, 'boxing', 3600);

select throws_ok(
  $$ select public.skip_training_day(current_setting('test.past_mon')::date) $$,
  23514, null,
  'a striking day with conditioning logged cannot be skipped'
);

-- ---------------------------------------------------------------------------
-- Another user
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"e9999999-9999-9999-9999-999999999999"}';

select throws_ok(
  $$ select public.set_plan_day(1::smallint, 'recovery', 'Rest') $$,
  'P0002', null,
  'another user cannot change a plan they do not own'
);

select is(
  public.unskip_training_day(current_setting('test.past_tue')::date)
  + (select count(*)::integer from public.workout_sessions),
  0,
  'another user can neither see nor remove someone else''s diary'
);

select * from finish();
rollback;
