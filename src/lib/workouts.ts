import { supabase } from '@/lib/supabase';
import type { Exercise, Routine, WorkoutSummary } from '@/types/db';

export interface PreviousSet {
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
}

/** Sets from the most recent workout that included each exercise ("previous" column, Hevy-style). */
export async function fetchPreviousSets(exerciseIds: string[]): Promise<Record<string, PreviousSet[]>> {
  if (exerciseIds.length === 0) return {};
  const { data, error } = await supabase.rpc('previous_sets', { p_exercise_ids: exerciseIds });
  if (error || !data) return {};
  const out: Record<string, PreviousSet[]> = {};
  for (const row of data as { exercise_id: string; sets: PreviousSet[] }[]) out[row.exercise_id] = row.sets;
  return out;
}

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Exercise[];
}

export async function fetchRoutines(): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('id, name, notes, updated_at, routine_exercises(id, exercise_id, position, target_sets, target_reps, rest_seconds, exercises(*))')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Routine[]).map((r) => ({
    ...r,
    routine_exercises: [...r.routine_exercises].sort((a, b) => a.position - b.position),
  }));
}

export async function fetchRecentWorkouts(limit = 20): Promise<WorkoutSummary[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, name, day, started_at, duration_s, total_volume, total_sets, pr_count, xp_earned')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as WorkoutSummary[];
}

export interface RoutineDraftExercise {
  exercise_id: string;
  target_sets: number;
  target_reps: string;
  rest_seconds: number;
}

export async function saveRoutine(params: { id?: string; name: string; exercises: RoutineDraftExercise[] }) {
  let routineId = params.id;
  if (routineId) {
    const { error } = await supabase
      .from('routines')
      .update({ name: params.name, updated_at: new Date().toISOString() })
      .eq('id', routineId);
    if (error) throw error;
    const { error: delError } = await supabase.from('routine_exercises').delete().eq('routine_id', routineId);
    if (delError) throw delError;
  } else {
    const { data, error } = await supabase.from('routines').insert({ name: params.name }).select('id').single();
    if (error) throw error;
    routineId = data.id as string;
  }
  if (params.exercises.length) {
    const { error } = await supabase
      .from('routine_exercises')
      .insert(params.exercises.map((e, i) => ({ ...e, routine_id: routineId, position: i + 1 })));
    if (error) throw error;
  }
  return routineId!;
}

export function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(kg >= 10000 ? 0 : 1)}t`;
  return `${Math.round(kg)} kg`;
}

export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  traps: 'Traps',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  cardio: 'Cardio',
};
