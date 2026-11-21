-- 0013 — Fitness: exercise library, training plan, templates, diary.
--
-- Mirrors the Finance module's discipline rather than inventing a second set
-- of rules: integer units (grams, seconds, metres), RLS plus explicit grants
-- on every table, and composite foreign keys carrying user_id so a
-- cross-user reference fails inside the database.
--
-- Two decisions shape the whole schema:
--
--  * A session SNAPSHOTS its template. Editing a plan must never rewrite a
--    workout you already did, so targets are copied in at session start and
--    the session never reads the template again.
--  * Direct and indirect volume are distinguishable. A muscle worked as the
--    primary mover counts as a direct set; one worked as a secondary does
--    not, and the two are never summed together.

create type public.equipment_kind as enum (
  'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'assisted', 'other'
);

create type public.muscle_group as enum (
  'chest', 'back', 'side_delts', 'rear_delts', 'front_delts',
  'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'
);

-- Primary = the muscle the exercise is for. Secondary = it contributes, but
-- the set must not be counted as direct volume for it.
create type public.muscle_role as enum ('primary', 'secondary');

create type public.session_kind as enum ('gym', 'striking', 'optional', 'recovery');

create type public.session_status as enum ('planned', 'in_progress', 'completed', 'skipped');

create type public.conditioning_activity as enum (
  'boxing', 'muay_thai', 'kickboxing', 'bjj', 'wrestling', 'running', 'other'
);

create type public.intensity_level as enum ('easy', 'moderate', 'hard');

-- How a logged weight should be read. A pair of 20kg dumbbells is "20 per
-- side", not 40, and conflating the two silently doubles training volume.
create type public.weight_basis as enum ('total', 'per_side', 'bodyweight_plus', 'assisted');

-- ---------------------------------------------------------------------------
-- Exercise library
-- ---------------------------------------------------------------------------

create table public.exercises (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  name      text not null constraint exercise_name_not_blank check (length(btrim(name)) > 0),
  equipment public.equipment_kind not null default 'other',

  -- Logged per side where it matters (single-arm pulldowns).
  is_unilateral boolean not null default false,

  weight_basis public.weight_basis not null default 'total',

  -- Default rest, overridable per template entry.
  default_rest_seconds public.seconds not null default 90,

  notes text,
  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exercises_user_id_id_key unique (user_id, id),
  constraint exercises_name_unique unique (user_id, name)
);

select app_private.apply_user_rls('public.exercises');
select public.attach_updated_at('public.exercises');
grant select, insert, update, delete on public.exercises to authenticated;

create table public.exercise_muscles (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null,
  exercise_id uuid not null,
  muscle   public.muscle_group not null,
  role     public.muscle_role not null default 'primary',

  constraint exercise_muscles_unique unique (exercise_id, muscle),
  constraint exercise_muscles_user_id_id_key unique (user_id, id),
  constraint exercise_muscles_exercise_fkey
    foreign key (user_id, exercise_id) references public.exercises (user_id, id) on delete cascade
);

comment on table public.exercise_muscles is
  'Which muscles an exercise works, and whether directly. Only primary roles '
  'count as direct weekly sets.';

select app_private.apply_user_rls('public.exercise_muscles');
grant select, insert, update, delete on public.exercise_muscles to authenticated;

create index exercise_muscles_exercise_idx on public.exercise_muscles (user_id, exercise_id);

-- ---------------------------------------------------------------------------
-- The weekly plan
-- ---------------------------------------------------------------------------

create table public.training_plans (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name    text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_plans_user_id_id_key unique (user_id, id)
);

select app_private.apply_user_rls('public.training_plans');
select public.attach_updated_at('public.training_plans');
grant select, insert, update, delete on public.training_plans to authenticated;

create table public.workout_templates (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name    text not null,
  kind    public.session_kind not null default 'gym',
  notes   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_templates_user_id_id_key unique (user_id, id),
  constraint workout_templates_name_unique unique (user_id, name)
);

select app_private.apply_user_rls('public.workout_templates');
select public.attach_updated_at('public.workout_templates');
grant select, insert, update, delete on public.workout_templates to authenticated;

create table public.training_plan_days (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null,

  -- 1 = Monday, matching ISO. Sunday is 7, so the week reads Monday-first.
  weekday smallint not null constraint weekday_valid check (weekday between 1 and 7),

  label text not null,
  kind  public.session_kind not null,
  template_id uuid,

  constraint training_plan_days_unique unique (plan_id, weekday),
  constraint training_plan_days_user_id_id_key unique (user_id, id),
  constraint training_plan_days_plan_fkey
    foreign key (user_id, plan_id) references public.training_plans (user_id, id) on delete cascade,
  constraint training_plan_days_template_fkey
    foreign key (user_id, template_id) references public.workout_templates (user_id, id) on delete set null
);

select app_private.apply_user_rls('public.training_plan_days');
grant select, insert, update, delete on public.training_plan_days to authenticated;

create table public.workout_template_exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  template_id uuid not null,
  exercise_id uuid not null,

  order_index integer not null,

  -- Working sets only. Warm-ups are logged but excluded from prescribed volume.
  target_sets integer not null constraint target_sets_positive check (target_sets > 0),
  rep_min     integer not null constraint rep_min_positive check (rep_min > 0),
  rep_max     integer not null,
  rest_seconds public.seconds not null default 90,

  -- Exercises performed back to back share a group.
  superset_group integer,

  constraint rep_range_ordered check (rep_max >= rep_min),
  constraint template_exercise_unique unique (template_id, exercise_id),
  constraint wte_user_id_id_key unique (user_id, id),
  constraint wte_template_fkey
    foreign key (user_id, template_id) references public.workout_templates (user_id, id) on delete cascade,
  constraint wte_exercise_fkey
    foreign key (user_id, exercise_id) references public.exercises (user_id, id) on delete restrict
);

select app_private.apply_user_rls('public.workout_template_exercises');
grant select, insert, update, delete on public.workout_template_exercises to authenticated;

create index wte_template_idx on public.workout_template_exercises (user_id, template_id, order_index);

-- ---------------------------------------------------------------------------
-- The diary
-- ---------------------------------------------------------------------------

create table public.workout_sessions (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  template_id uuid,
  name        text not null,
  kind        public.session_kind not null default 'gym',

  -- Intent versus reality. Rescheduling or skipping writes here and never
  -- touches the plan, so history is not rewritten.
  scheduled_for date,
  performed_on  date not null,

  status     public.session_status not null default 'in_progress',
  started_at timestamptz,
  ended_at   timestamptz,
  notes      text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workout_sessions_user_id_id_key unique (user_id, id),
  constraint workout_sessions_template_fkey
    foreign key (user_id, template_id) references public.workout_templates (user_id, id) on delete set null,
  -- One session per template per day: re-opening the same workout must not
  -- silently create a duplicate diary entry.
  constraint workout_sessions_no_duplicate unique (user_id, template_id, performed_on)
);

select app_private.apply_user_rls('public.workout_sessions');
select public.attach_updated_at('public.workout_sessions');
grant select, insert, update, delete on public.workout_sessions to authenticated;

create index workout_sessions_user_date_idx
  on public.workout_sessions (user_id, performed_on desc);

create table public.workout_session_exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  session_id  uuid not null,
  exercise_id uuid not null,

  order_index integer not null,

  -- Snapshot of the template at the moment the session started. The session
  -- never reads the template again, so editing a plan cannot rewrite a
  -- workout that already happened.
  name_snapshot text not null,
  target_sets   integer not null,
  rep_min       integer not null,
  rep_max       integer not null,
  rest_seconds  public.seconds not null default 90,

  notes text,

  constraint wse_unique unique (session_id, exercise_id),
  constraint wse_user_id_id_key unique (user_id, id),
  constraint wse_session_fkey
    foreign key (user_id, session_id) references public.workout_sessions (user_id, id) on delete cascade,
  constraint wse_exercise_fkey
    foreign key (user_id, exercise_id) references public.exercises (user_id, id) on delete restrict
);

comment on column public.workout_session_exercises.target_sets is
  'Snapshotted from the template at session start — see the table comment on '
  'why the session never reads the template again.';

select app_private.apply_user_rls('public.workout_session_exercises');
grant select, insert, update, delete on public.workout_session_exercises to authenticated;

create index wse_session_idx on public.workout_session_exercises (user_id, session_id, order_index);

create table public.workout_sets (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_exercise_id uuid not null,

  set_index integer not null constraint set_index_positive check (set_index > 0),

  -- Whole grams. Training volume sums weight x reps over thousands of sets,
  -- and plate increments are fractional in kilograms.
  weight_grams public.grams not null default 0,
  reps         integer not null constraint reps_not_negative check (reps >= 0),

  -- Reps in reserve. Null when not recorded — absent is not the same as zero,
  -- and zero RIR means genuine failure.
  rir smallint constraint rir_range check (rir is null or rir between 0 and 10),

  -- Warm-ups are logged but never count towards prescribed volume.
  is_warmup boolean not null default false,

  -- Unilateral work logged per side where it matters.
  side text not null default 'both'
       constraint side_known check (side in ('both', 'left', 'right')),

  -- Assistance (band or machine) reduces effective load; stored separately so
  -- the raw entry is preserved rather than folded into a negative weight.
  assistance_grams public.grams not null default 0,

  completed_at timestamptz,
  created_at   timestamptz not null default now(),

  constraint workout_sets_unique unique (session_exercise_id, set_index, side),
  constraint workout_sets_user_id_id_key unique (user_id, id),
  constraint workout_sets_exercise_fkey
    foreign key (user_id, session_exercise_id)
    references public.workout_session_exercises (user_id, id) on delete cascade
);

select app_private.apply_user_rls('public.workout_sets');
grant select, insert, update, delete on public.workout_sets to authenticated;

create index workout_sets_exercise_idx on public.workout_sets (user_id, session_exercise_id, set_index);

-- ---------------------------------------------------------------------------
-- Conditioning and bodyweight
-- ---------------------------------------------------------------------------

-- Deliberately separate from workout_sessions: a boxing round is not a
-- hypertrophy set, and counting them together would make both meaningless.
create table public.conditioning_sessions (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  performed_on date not null,
  activity public.conditioning_activity not null,

  duration_seconds public.seconds not null default 0,
  distance_metres  public.metres,
  intensity public.intensity_level not null default 'moderate',
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conditioning_user_id_id_key unique (user_id, id)
);

select app_private.apply_user_rls('public.conditioning_sessions');
select public.attach_updated_at('public.conditioning_sessions');
grant select, insert, update, delete on public.conditioning_sessions to authenticated;

create index conditioning_user_date_idx
  on public.conditioning_sessions (user_id, performed_on desc);

create table public.bodyweight_entries (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  measured_on  date not null,
  weight_grams public.grams not null,
  notes text,

  created_at timestamptz not null default now(),

  -- One reading per day: two would make a trend chart ambiguous.
  constraint bodyweight_one_per_day unique (user_id, measured_on),
  constraint bodyweight_user_id_id_key unique (user_id, id)
);

select app_private.apply_user_rls('public.bodyweight_entries');
grant select, insert, update, delete on public.bodyweight_entries to authenticated;

create index bodyweight_user_date_idx on public.bodyweight_entries (user_id, measured_on desc);
