-- 0014 — Fitness analytics views, and seeding the prescribed programme.

-- Working sets only: warm-ups are logged but never count towards volume,
-- and a set with zero reps was not performed.
create view public.set_volume
with (security_invoker = true)
as
select
  s.user_id,
  s.id                 as set_id,
  wse.session_id,
  wse.exercise_id,
  ws.performed_on,
  s.weight_grams,
  s.reps,
  s.rir,
  s.side,
  -- Effective load: assistance reduces what was actually lifted.
  greatest(s.weight_grams - s.assistance_grams, 0)::bigint as effective_grams,
  (greatest(s.weight_grams - s.assistance_grams, 0) * s.reps)::bigint as volume_grams
from public.workout_sets s
join public.workout_session_exercises wse
  on wse.id = s.session_exercise_id and wse.user_id = s.user_id
join public.workout_sessions ws
  on ws.id = wse.session_id and ws.user_id = s.user_id
where not s.is_warmup
  and s.reps > 0
  and ws.status = 'completed';

grant select on public.set_volume to authenticated;

-- ---------------------------------------------------------------------------

-- Weekly direct sets per muscle.
--
-- Only primary roles count. A bench press works triceps, but counting it as
-- a direct triceps set inflates the figure the user is actually trying to
-- manage. Indirect volume is exposed separately below.
create view public.weekly_muscle_volume
with (security_invoker = true)
as
select
  sv.user_id,
  date_trunc('week', sv.performed_on)::date as week_start,
  em.muscle,
  em.role,
  count(*)::integer                as sets,
  coalesce(sum(sv.volume_grams), 0)::bigint as volume_grams
from public.set_volume sv
join public.exercise_muscles em
  on em.exercise_id = sv.exercise_id and em.user_id = sv.user_id
group by sv.user_id, date_trunc('week', sv.performed_on)::date, em.muscle, em.role;

comment on view public.weekly_muscle_volume is
  'Sets per muscle per week, split by role. Direct volume is role = primary; '
  'secondary is reported separately and must never be added to it.';

grant select on public.weekly_muscle_volume to authenticated;

-- ---------------------------------------------------------------------------

-- Per-exercise history: one row per session, with that session's best set.
create view public.exercise_history
with (security_invoker = true)
as
select
  sv.user_id,
  sv.exercise_id,
  sv.session_id,
  sv.performed_on,
  count(*)::integer                     as working_sets,
  max(sv.effective_grams)::bigint       as top_weight_grams,
  sum(sv.volume_grams)::bigint          as volume_grams,
  max(sv.reps)::integer                 as best_reps,
  -- Epley. An estimate, and labelled as one wherever it is shown.
  max((sv.effective_grams * (1 + sv.reps::numeric / 30)))::bigint as est_1rm_grams
from public.set_volume sv
group by sv.user_id, sv.exercise_id, sv.session_id, sv.performed_on;

comment on view public.exercise_history is
  'One row per exercise per session. est_1rm is an Epley estimate and must '
  'always be presented as an estimate, never as a lift that happened.';

grant select on public.exercise_history to authenticated;

-- ---------------------------------------------------------------------------
-- Seeding the prescribed programme
-- ---------------------------------------------------------------------------

-- Creates the exercise library, the three gym templates and the weekly plan.
--
-- Seeds the programme and nothing else: no sessions, no sets, no history.
-- Every workout record must come from the user actually training.
create or replace function public.seed_training_programme()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid     uuid := (select auth.uid());
  plan_id uuid;
  push_id uuid;
  pull_id uuid;
  upper_id uuid;
  ex record;
  created integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from public.exercises where user_id = uid) then
    raise exception 'this account already has a training programme'
      using errcode = 'unique_violation';
  end if;

  -- Exercise library, with the muscle each one is actually for.
  for ex in
    select * from (values
      ('Incline Dumbbell Press',          'dumbbell',   false, 'per_side',       150, 'chest'),
      ('Cable Chest Fly',                 'cable',      false, 'total',           90, 'chest'),
      ('Cable Lateral Raises',            'cable',      false, 'total',           75, 'side_delts'),
      ('Triceps Pushdowns',               'cable',      false, 'total',           75, 'triceps'),
      ('Overhead Triceps Extensions',     'cable',      false, 'total',           75, 'triceps'),
      ('Leg Extensions',                  'machine',    false, 'total',           90, 'quads'),
      ('Bent-over Barbell Rows',          'barbell',    false, 'total',          150, 'back'),
      ('Lat Pulldowns',                   'cable',      false, 'total',           90, 'back'),
      ('Single-arm Cable Lat Pulldowns',  'cable',      true,  'total',           75, 'back'),
      ('Reverse Pec Deck',                'machine',    false, 'total',           75, 'rear_delts'),
      ('Incline Dumbbell Curls',          'dumbbell',   false, 'per_side',        75, 'biceps'),
      ('Hammer Curls',                    'dumbbell',   false, 'per_side',        75, 'biceps'),
      ('Seated Leg Curls',                'machine',    false, 'total',           90, 'hamstrings'),
      ('Flat Barbell Bench Press',        'barbell',    false, 'total',          180, 'chest'),
      ('Pull-ups',                        'bodyweight', false, 'bodyweight_plus',150, 'back'),
      ('Seated Cable Rows',               'cable',      false, 'total',           90, 'back'),
      ('Preacher Curls',                  'machine',    false, 'total',           75, 'biceps'),
      ('Rope Triceps Extensions',         'cable',      false, 'total',           75, 'triceps'),
      ('Hack Squats / Leg Press',         'machine',    false, 'total',          150, 'quads'),
      ('Calf Raises',                     'machine',    false, 'total',           60, 'calves')
    ) as t(name, equipment, unilateral, basis, rest, muscle)
  loop
    insert into public.exercises (user_id, name, equipment, is_unilateral, weight_basis, default_rest_seconds)
    values (uid, ex.name, ex.equipment::public.equipment_kind, ex.unilateral,
            ex.basis::public.weight_basis, ex.rest);

    insert into public.exercise_muscles (user_id, exercise_id, muscle, role)
    select uid, e.id, ex.muscle::public.muscle_group, 'primary'
    from public.exercises e where e.user_id = uid and e.name = ex.name;

    created := created + 1;
  end loop;

  -- Secondary involvement, recorded so indirect volume can be shown without
  -- ever being counted as direct.
  insert into public.exercise_muscles (user_id, exercise_id, muscle, role)
  select uid, e.id, m.muscle::public.muscle_group, 'secondary'
  from public.exercises e
  join (values
    ('Incline Dumbbell Press',   'front_delts'),
    ('Incline Dumbbell Press',   'triceps'),
    ('Flat Barbell Bench Press', 'front_delts'),
    ('Flat Barbell Bench Press', 'triceps'),
    ('Bent-over Barbell Rows',   'biceps'),
    ('Bent-over Barbell Rows',   'rear_delts'),
    ('Lat Pulldowns',            'biceps'),
    ('Pull-ups',                 'biceps'),
    ('Seated Cable Rows',        'biceps'),
    ('Hack Squats / Leg Press',  'glutes')
  ) as m(name, muscle) on m.name = e.name
  where e.user_id = uid;

  insert into public.workout_templates (user_id, name, kind)
  values (uid, 'Push', 'gym') returning id into push_id;
  insert into public.workout_templates (user_id, name, kind)
  values (uid, 'Pull', 'gym') returning id into pull_id;
  insert into public.workout_templates (user_id, name, kind)
  values (uid, 'Upper + Accessory', 'gym') returning id into upper_id;

  -- Tuesday — Push: 16 working sets.
  insert into public.workout_template_exercises
    (user_id, template_id, exercise_id, order_index, target_sets, rep_min, rep_max, rest_seconds)
  select uid, push_id, e.id, t.ord, t.sets, t.lo, t.hi, e.default_rest_seconds
  from (values
    ('Incline Dumbbell Press',      1, 3,  6, 10),
    ('Cable Chest Fly',             2, 3, 10, 15),
    ('Cable Lateral Raises',        3, 3, 12, 20),
    ('Triceps Pushdowns',           4, 2, 10, 15),
    ('Overhead Triceps Extensions', 5, 2, 10, 15),
    ('Leg Extensions',              6, 3, 12, 15)
  ) as t(name, ord, sets, lo, hi)
  join public.exercises e on e.name = t.name and e.user_id = uid;

  -- Thursday — Pull: 18 working sets. RDLs are deliberately absent.
  insert into public.workout_template_exercises
    (user_id, template_id, exercise_id, order_index, target_sets, rep_min, rep_max, rest_seconds)
  select uid, pull_id, e.id, t.ord, t.sets, t.lo, t.hi, e.default_rest_seconds
  from (values
    ('Bent-over Barbell Rows',         1, 3,  6, 10),
    ('Lat Pulldowns',                  2, 3,  8, 12),
    ('Single-arm Cable Lat Pulldowns', 3, 2, 10, 15),
    ('Reverse Pec Deck',               4, 3, 12, 20),
    ('Incline Dumbbell Curls',         5, 2, 10, 12),
    ('Hammer Curls',                   6, 2, 10, 15),
    ('Seated Leg Curls',               7, 3, 10, 15)
  ) as t(name, ord, sets, lo, hi)
  join public.exercises e on e.name = t.name and e.user_id = uid;

  -- Saturday — Upper + Accessory: 20 working sets.
  insert into public.workout_template_exercises
    (user_id, template_id, exercise_id, order_index, target_sets, rep_min, rep_max, rest_seconds)
  select uid, upper_id, e.id, t.ord, t.sets, t.lo, t.hi, e.default_rest_seconds
  from (values
    ('Flat Barbell Bench Press', 1, 2,  6, 10),
    ('Pull-ups',                 2, 2,  6, 10),
    ('Seated Cable Rows',        3, 2,  8, 12),
    ('Cable Lateral Raises',     4, 4, 12, 20),
    ('Reverse Pec Deck',         5, 2, 15, 20),
    ('Preacher Curls',           6, 2, 10, 12),
    ('Rope Triceps Extensions',  7, 2, 10, 15),
    ('Hack Squats / Leg Press',  8, 2, 10, 12),
    ('Calf Raises',              9, 2, 12, 15)
  ) as t(name, ord, sets, lo, hi)
  join public.exercises e on e.name = t.name and e.user_id = uid;

  insert into public.training_plans (user_id, name)
  values (uid, 'Weekly programme') returning id into plan_id;

  insert into public.training_plan_days (user_id, plan_id, weekday, label, kind, template_id)
  values
    (uid, plan_id, 1, 'Boxing / Footwork',        'striking', null),
    (uid, plan_id, 2, 'Push',                     'gym',      push_id),
    (uid, plan_id, 3, 'Muay Thai / Kickboxing',   'striking', null),
    (uid, plan_id, 4, 'Pull',                     'gym',      pull_id),
    (uid, plan_id, 5, 'Optional BJJ / Grappling', 'optional', null),
    (uid, plan_id, 6, 'Upper + Accessory',        'gym',      upper_id),
    (uid, plan_id, 7, 'Rest / Recovery',          'recovery', null);

  return jsonb_build_object('exercises', created, 'templates', 3, 'plan_days', 7);
end;
$$;

comment on function public.seed_training_programme is
  'Seeds the prescribed programme only — library, templates and weekly plan. '
  'Creates no sessions or sets: all workout history must be user-generated.';

revoke all on function public.seed_training_programme() from public, anon;
grant execute on function public.seed_training_programme() to authenticated;
