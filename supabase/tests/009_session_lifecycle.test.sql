-- Fitness: starting a session snapshots atomically; completing requires work.

begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('e6666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'starter@test.local', 'x'),
  ('e7777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'intruder@test.local', 'x');

select ok(
  not has_function_privilege('anon', 'public.start_workout_session(uuid, date)', 'execute'),
  'anon cannot start a session'
);
select ok(
  not has_function_privilege('anon', 'public.complete_workout_session(uuid)', 'execute'),
  'anon cannot complete a session'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"e6666666-6666-6666-6666-666666666666"}';

select lives_ok($$ select public.seed_training_programme() $$, 'the programme seeds');

select lives_ok(
  $$ select public.start_workout_session(
       (select id from public.workout_templates where name = 'Push'), '2026-11-24') $$,
  'a session starts from a template'
);

select is(
  (select status::text from public.workout_sessions where performed_on = '2026-11-24'),
  'in_progress', 'the new session is in progress'
);

select is(
  (select count(*)::integer from public.workout_session_exercises), 6,
  'every template exercise is snapshotted'
);

select is(
  (select sum(target_sets)::integer from public.workout_session_exercises), 16,
  'the snapshot carries the prescribed 16 working sets'
);

-- Re-opening the same workout on the same day returns the same diary entry.
select is(
  public.start_workout_session(
    (select id from public.workout_templates where name = 'Push'), '2026-11-24'),
  (select id from public.workout_sessions where performed_on = '2026-11-24'),
  'starting again returns the existing session'
);

select is(
  (select count(*)::integer from public.workout_sessions), 1,
  're-opening does not duplicate the session or its snapshot'
);

select throws_ok(
  $$ select public.complete_workout_session(
       (select id from public.workout_sessions where performed_on = '2026-11-24')) $$,
  23514, null,
  'a session with nothing logged cannot be completed'
);

insert into public.workout_sets (user_id, session_exercise_id, set_index, weight_grams, reps, is_warmup)
select 'e6666666-6666-6666-6666-666666666666', id, 1, 10000, 12, true
from public.workout_session_exercises where name_snapshot = 'Incline Dumbbell Press';

select throws_ok(
  $$ select public.complete_workout_session(
       (select id from public.workout_sessions where performed_on = '2026-11-24')) $$,
  23514, null,
  'warm-ups alone do not make a session completable'
);

insert into public.workout_sets (user_id, session_exercise_id, set_index, weight_grams, reps)
select 'e6666666-6666-6666-6666-666666666666', id, 2, 22500, 8
from public.workout_session_exercises where name_snapshot = 'Incline Dumbbell Press';

select lives_ok(
  $$ select public.complete_workout_session(
       (select id from public.workout_sessions where performed_on = '2026-11-24')) $$,
  'a session with a working set completes'
);

select is(
  (select status::text || ':' || (ended_at is not null)::text
   from public.workout_sessions where performed_on = '2026-11-24'),
  'completed:true', 'completion records status and end time'
);

select throws_ok(
  $$ select public.complete_workout_session(
       (select id from public.workout_sessions where performed_on = '2026-11-24')) $$,
  23514, null,
  'a completed session cannot be completed twice'
);

-- ---------------------------------------------------------------------------
-- Another user can neither start from nor complete someone else's data.
-- ---------------------------------------------------------------------------

-- Capture the owner's real ids first: under RLS the intruder could not even
-- select them, and a test that passes null would prove nothing.
select set_config('test.push_template',
  (select id::text from public.workout_templates where name = 'Push'), true);
select set_config('test.pull_template',
  (select id::text from public.workout_templates where name = 'Pull'), true);

-- An open session with no sets: if ownership were not checked, completing it
-- would fail with 23514 instead, so P0002 below proves the ownership guard.
select public.start_workout_session(current_setting('test.pull_template')::uuid, '2026-11-26');
select set_config('test.open_session',
  (select id::text from public.workout_sessions where performed_on = '2026-11-26'), true);

set local request.jwt.claims = '{"sub":"e7777777-7777-7777-7777-777777777777"}';

select throws_ok(
  $$ select public.start_workout_session(current_setting('test.push_template')::uuid, '2026-11-25') $$,
  'P0002', null,
  'another user cannot start a session from a template they do not own'
);

select throws_ok(
  $$ select public.complete_workout_session(current_setting('test.open_session')::uuid) $$,
  'P0002', null,
  'another user cannot complete a session they do not own'
);

select * from finish();
rollback;
