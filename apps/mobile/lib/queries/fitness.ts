import { Measures, type Grams } from '@life-os/fitness-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/lib/auth/session';
import { queryKeys } from '@/lib/queries/keys';
import { supabase } from '@/lib/supabase';

export type SessionKind = 'gym' | 'striking' | 'optional' | 'recovery';
export type SessionStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

/**
 * A local calendar date, YYYY-MM-DD.
 *
 * Not toISOString(): that is UTC, and in IST it files a 2am workout against
 * yesterday. performed_on is a DATE for exactly this reason.
 */
export function localDateISO(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** ISO weekday, 1 = Monday … 7 = Sunday, matching training_plan_days. */
export function isoWeekday(date = new Date()): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

export const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** BIGINT/grams columns arrive as number or string; reject anything inexact. */
function gramsFromDb(value: unknown): Grams {
  return Measures.grams(Number(value ?? 0));
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export interface PlanDay {
  weekday: number;
  label: string;
  kind: SessionKind;
  templateId: string | null;
  /** Prescribed working sets — null for days without a gym template. */
  workingSets: number | null;
  exerciseCount: number | null;
}

export interface TrainingPlan {
  /** False until the programme is seeded: the empty state, not an error. */
  hasProgramme: boolean;
  days: PlanDay[];
}

export function useTrainingPlan() {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.trainingPlan(userId ?? 'anonymous'),
    enabled: userId !== null,
    queryFn: async (): Promise<TrainingPlan> => {
      const [days, entries] = await Promise.all([
        supabase
          .from('training_plan_days')
          .select('weekday, label, kind, template_id, training_plans!inner(is_active)')
          .eq('training_plans.is_active', true)
          .order('weekday'),
        supabase.from('workout_template_exercises').select('template_id, target_sets'),
      ]);

      if (days.error) throw new Error(days.error.message);
      if (entries.error) throw new Error(entries.error.message);

      const totals = new Map<string, { sets: number; count: number }>();
      for (const row of entries.data ?? []) {
        const id = row.template_id as string;
        const t = totals.get(id) ?? { sets: 0, count: 0 };
        t.sets += row.target_sets as number;
        t.count += 1;
        totals.set(id, t);
      }

      const planDays = (days.data ?? []).map((row): PlanDay => {
        const templateId = (row.template_id as string | null) ?? null;
        const t = templateId ? totals.get(templateId) : undefined;
        return {
          weekday: row.weekday as number,
          label: row.label as string,
          kind: row.kind as SessionKind,
          templateId,
          workingSets: t?.sets ?? null,
          exerciseCount: t?.count ?? null,
        };
      });

      return { hasProgramme: planDays.length > 0, days: planDays };
    },
  });
}

export function useSeedProgramme() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('seed_training_programme');
      if (error) throw new Error(error.message);
      return data as { exercises: number; templates: number; plan_days: number };
    },
    onSuccess: () => {
      if (userId) void client.invalidateQueries({ queryKey: queryKeys.trainingPlan(userId) });
    },
  });
}

// ---------------------------------------------------------------------------
// The diary
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: string;
  name: string;
  templateId: string | null;
  performedOn: string;
  status: SessionStatus;
}

/** Sessions over the last `days` days, newest first. */
export function useRecentSessions(days = 14) {
  const userId = useUserId();

  return useQuery({
    queryKey: [...queryKeys.recentSessions(userId ?? 'anonymous'), days],
    enabled: userId !== null,
    queryFn: async (): Promise<SessionSummary[]> => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id, name, template_id, performed_on, status')
        .gte('performed_on', localDateISO(since))
        .order('performed_on', { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        templateId: (row.template_id as string | null) ?? null,
        performedOn: row.performed_on as string,
        status: row.status as SessionStatus,
      }));
    },
  });
}

/** Starts — or re-opens — the session for a template today. Returns its id. */
export function useStartSession() {
  const client = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async ({ templateId, date }: { templateId: string; date?: string }) => {
      const { data, error } = await supabase.rpc('start_workout_session', {
        p_template_id: templateId,
        p_performed_on: date ?? localDateISO(),
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      if (userId) void client.invalidateQueries({ queryKey: queryKeys.recentSessions(userId) });
    },
  });
}

export interface LoggedSet {
  id: string;
  setIndex: number;
  weight: Grams;
  reps: number;
  rir: number | null;
  isWarmup: boolean;
}

export interface SessionExercise {
  id: string;
  name: string;
  orderIndex: number;
  targetSets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
  sets: LoggedSet[];
}

export interface WorkoutSessionDetail extends SessionSummary {
  exercises: SessionExercise[];
}

export function useWorkoutSession(sessionId: string) {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.workoutSession(userId ?? 'anonymous', sessionId),
    enabled: userId !== null && sessionId.length > 0,
    queryFn: async (): Promise<WorkoutSessionDetail> => {
      const [session, exercises] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select('id, name, template_id, performed_on, status')
          .eq('id', sessionId)
          .single(),
        supabase
          .from('workout_session_exercises')
          .select(
            'id, name_snapshot, order_index, target_sets, rep_min, rep_max, rest_seconds, ' +
              'workout_sets(id, set_index, weight_grams, reps, rir, is_warmup)',
          )
          .eq('session_id', sessionId)
          .order('order_index'),
      ]);

      if (session.error) throw new Error(session.error.message);
      if (exercises.error) throw new Error(exercises.error.message);

      const s = session.data;
      return {
        id: s.id as string,
        name: s.name as string,
        templateId: (s.template_id as string | null) ?? null,
        performedOn: s.performed_on as string,
        status: s.status as SessionStatus,
        exercises: ((exercises.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
          id: row.id as string,
          name: row.name_snapshot as string,
          orderIndex: row.order_index as number,
          targetSets: row.target_sets as number,
          repMin: row.rep_min as number,
          repMax: row.rep_max as number,
          restSeconds: Number(row.rest_seconds),
          sets: ((row.workout_sets as Record<string, unknown>[] | null) ?? [])
            .map((set) => ({
              id: set.id as string,
              setIndex: set.set_index as number,
              weight: gramsFromDb(set.weight_grams),
              reps: set.reps as number,
              rir: (set.rir as number | null) ?? null,
              isWarmup: set.is_warmup as boolean,
            }))
            .sort((a, b) => a.setIndex - b.setIndex),
        })),
      };
    },
  });
}

function useInvalidateSession(sessionId: string) {
  const client = useQueryClient();
  const userId = useUserId();
  return () => {
    if (!userId) return;
    void client.invalidateQueries({ queryKey: queryKeys.workoutSession(userId, sessionId) });
    void client.invalidateQueries({ queryKey: queryKeys.recentSessions(userId) });
  };
}

export interface NewSet {
  sessionExerciseId: string;
  weight: Grams;
  reps: number;
  rir: number | null;
  isWarmup: boolean;
  /** Next free index for this exercise; the unique key rejects a collision. */
  setIndex: number;
}

export function useLogSet(sessionId: string) {
  const userId = useUserId();
  const invalidate = useInvalidateSession(sessionId);

  return useMutation({
    mutationFn: async (input: NewSet) => {
      if (!userId) throw new Error('not signed in');
      const { error } = await supabase.from('workout_sets').insert({
        user_id: userId,
        session_exercise_id: input.sessionExerciseId,
        set_index: input.setIndex,
        weight_grams: input.weight,
        reps: input.reps,
        rir: input.rir,
        is_warmup: input.isWarmup,
        completed_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSet(sessionId: string) {
  const invalidate = useInvalidateSession(sessionId);

  return useMutation({
    mutationFn: async (setId: string) => {
      const { error } = await supabase.from('workout_sets').delete().eq('id', setId);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useCompleteSession(sessionId: string) {
  const invalidate = useInvalidateSession(sessionId);

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('complete_workout_session', { p_session_id: sessionId });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}
