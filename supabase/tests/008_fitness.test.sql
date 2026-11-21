-- Fitness: the seeded programme, snapshotting, and volume accounting.

begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values ('e5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'lifter@test.local', 'x');

set local role authenticated;
set local request.jwt.claims = '{"sub":"e5555555-5555-5555-5555-555555555555"}';

select is((select count(*) from public.exercises), 0::bigint, 'a new account has no exercises');

select lives_ok($$ select public.seed_training_programme() $$, 'the programme seeds');

select is((select count(*) from public.exercises), 20::bigint, 'twenty exercises are seeded');
select is((select count(*) from public.workout_templates), 3::bigint, 'three gym templates');
select is((select count(*) from public.training_plan_days), 7::bigint, 'seven days in the week');

-- The prescribed working-set totals from the programme.
select is(
  (select sum(target_sets)::integer from public.workout_template_exercises wte
   join public.workout_templates t on t.id = wte.template_id where t.name = 'Push'),
  16, 'Push prescribes 16 working sets'
);
select is(
  (select sum(target_sets)::integer from public.workout_template_exercises wte
   join public.workout_templates t on t.id = wte.template_id where t.name = 'Pull'),
  18, 'Pull prescribes 18 working sets'
);
select is(
  (select sum(target_sets)::integer from public.workout_template_exercises wte
   join public.workout_templates t on t.id = wte.template_id where t.name = 'Upper + Accessory'),
  20, 'Upper prescribes 20 working sets'
);

-- RDLs were removed deliberately and must not reappear.
select is(
  (select count(*) from public.exercises where name ilike '%romanian%' or name ilike '%RDL%'),
  0::bigint, 'RDLs are not reintroduced'
);

-- Seeding the programme must not invent training history.
select is((select count(*) from public.workout_sessions), 0::bigint, 'no sessions are fabricated');
select is((select count(*) from public.workout_sets), 0::bigint, 'no sets are fabricated');

-- ---------------------------------------------------------------------------
-- Snapshotting and volume
-- ---------------------------------------------------------------------------

insert into public.workout_sessions (id, user_id, template_id, name, performed_on, status)
select 'aa000001-0000-0000-0000-000000000001', 'e5555555-5555-5555-5555-555555555555',
       t.id, 'Push', '2026-11-21', 'completed'
from public.workout_templates t where t.name = 'Push';

insert into public.workout_session_exercises
  (id, user_id, session_id, exercise_id, order_index, name_snapshot, target_sets, rep_min, rep_max)
select 'bb000001-0000-0000-0000-000000000001', 'e5555555-5555-5555-5555-555555555555',
       'aa000001-0000-0000-0000-000000000001', e.id, 1, e.name, 3, 6, 10
from public.exercises e where e.name = 'Incline Dumbbell Press';

-- Two working sets and one warm-up.
insert into public.workout_sets (user_id, session_exercise_id, set_index, weight_grams, reps, is_warmup)
values
  ('e5555555-5555-5555-5555-555555555555','bb000001-0000-0000-0000-000000000001', 1, 10000, 12, true),
  ('e5555555-5555-5555-5555-555555555555','bb000001-0000-0000-0000-000000000001', 2, 20000, 10, false),
  ('e5555555-5555-5555-5555-555555555555','bb000001-0000-0000-0000-000000000001', 3, 20000,  8, false);

select is(
  (select count(*)::integer from public.set_volume), 2,
  'warm-up sets are excluded from working volume'
);

-- 20kg x 10 plus 20kg x 8 = 360kg.
select is(
  (select sum(volume_grams)::bigint from public.set_volume), 360000::bigint,
  'volume is weight times reps, in grams'
);

-- The snapshot must not move when the template changes.
update public.workout_template_exercises wte
   set target_sets = 99
  from public.exercises e
 where e.id = wte.exercise_id and e.name = 'Incline Dumbbell Press';

select is(
  (select target_sets from public.workout_session_exercises
   where id = 'bb000001-0000-0000-0000-000000000001'),
  3,
  'editing the template does not rewrite a session already performed'
);

select * from finish();
rollback;
