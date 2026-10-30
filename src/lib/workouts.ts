import { formatDuration } from '@/lib/dates';
import type { ExerciseSession, HistorySet } from '@/lib/history-stats';
import { enqueue, waitingEntries } from '@/lib/outbox';
import { applyPending, newId } from '@/lib/outbox-core';
import { supabase } from '@/lib/supabase';
import type { Exercise, ExerciseKind, Routine, WorkoutSummary } from '@/types/db';
import { weightNumber, type WeightUnit } from '@/lib/units';

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

export interface ExerciseBest {
  e1rm: number;
  weight: number;
  /** The most reps done at each weight in past workouts (weight 0 for bodyweight). */
  history: { weight: number; reps: number }[];
}

/** Your bests so far per exercise, for live PR medals. Exercises never done are left out. */
export async function fetchBests(exerciseIds: string[]): Promise<Record<string, ExerciseBest>> {
  if (exerciseIds.length === 0) return {};
  const [bests, history] = await Promise.all([
    supabase.rpc('exercise_bests', { p_exercise_ids: exerciseIds }),
    supabase.rpc('exercise_set_history', { p_exercise_ids: exerciseIds }),
  ]);
  const out: Record<string, ExerciseBest> = {};
  const entry = (id: string) => (out[id] ??= { e1rm: 0, weight: 0, history: [] });
  for (const row of (bests.data ?? []) as { exercise_id: string; best_e1rm: number | null; best_weight: number | null }[]) {
    Object.assign(entry(row.exercise_id), { e1rm: Number(row.best_e1rm ?? 0), weight: Number(row.best_weight ?? 0) });
  }
  for (const row of (history.data ?? []) as { exercise_id: string; weight_kg: number; reps: number }[]) {
    entry(row.exercise_id).history.push({ weight: Number(row.weight_kg), reps: Number(row.reps) });
  }
  return out;
}

/**
 * A set is a PR when no earlier set had at least as much weight and at least as many reps:
 * more weight, or more reps at that weight or heavier. Matches refresh_prs on the server.
 */
export function beatsAll(weight: number, reps: number, earlier: { weight: number; reps: number }[]): boolean {
  return reps > 0 && !earlier.some((p) => p.weight >= weight && p.reps >= reps);
}

/** Epley estimate, trusted only for 1-12 reps (matches the server). */
export function e1rm(weight: number, reps: number): number | null {
  if (!(weight > 0) || !(reps >= 1 && reps <= 12)) return null;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/** Every session of one exercise, newest first, with its sets in order. */
export async function fetchExerciseHistory(exerciseId: string): Promise<ExerciseSession[]> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select(
      'workouts!inner(id, name, day, started_at), workout_sets(position, set_type, weight_kg, reps, duration_s, distance_m, is_pr)'
    )
    .eq('exercise_id', exerciseId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    workouts: { id: string; name: string; day: string; started_at: string };
    workout_sets: (HistorySet & { position: number })[];
  }[];
  return rows
    .map((r) => ({
      workoutId: r.workouts.id,
      workoutName: r.workouts.name,
      day: r.workouts.day,
      startedAt: r.workouts.started_at,
      sets: [...r.workout_sets].sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * The whole library plus your custom exercises, by name. Fetched in pages because the server returns at
 * most 1,000 rows at a time, and without the instructions, which only the exercise page needs.
 */
export async function fetchExercises(): Promise<Exercise[]> {
  const PAGE = 1000;
  const out: Exercise[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, primary_muscle, secondary_muscles, equipment, kind, created_by, gif_id, media_id')
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as Exercise[]));
    if (!data || data.length < PAGE) return out;
  }
}

/** Search that matches every word in any order: "press bench dumbbell" finds "Bench Press (Dumbbell)". */
export function matchesSearch(name: string, query: string): boolean {
  const words = query
    .toLowerCase()
    .split(/[\s,()-]+/)
    .filter(Boolean);
  const n = name.toLowerCase();
  return words.every((w) => n.includes(w));
}

export async function fetchRoutines(): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routines')
    .select(
      'id, name, notes, updated_at, routine_exercises(id, exercise_id, position, target_sets, target_reps, rest_seconds, exercises(*))'
    )
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Routine[]).map((r) => ({
    ...r,
    routine_exercises: [...r.routine_exercises].sort((a, b) => a.position - b.position),
  }));
}

/** Finished workouts, newest first; `offset` pages further back through the history. */
export async function fetchRecentWorkouts(limit = 20, offset = 0): Promise<WorkoutSummary[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, name, day, started_at, duration_s, total_volume, total_sets, pr_count')
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as WorkoutSummary[];
}

export interface LoggedSet {
  set_type: string;
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  is_pr?: boolean;
}

export interface ExerciseLog {
  /** Opens the exercise's how-to page. */
  exercise_id?: string;
  name: string;
  kind: ExerciseKind;
  notes?: string | null;
  /** The exercise's animation (see ExerciseDemo). */
  gif_id?: string | null;
  /** For the muscle map. */
  primary_muscle?: string;
  secondary_muscles?: string[];
  sets: LoggedSet[];
}

export async function countWorkouts(): Promise<number> {
  const { count, error } = await supabase.from('workouts').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

/** Exercises and sets for a batch of finished workouts, in the order they were done. */
export async function fetchWorkoutExercises(workoutIds: string[]): Promise<Record<string, ExerciseLog[]>> {
  if (workoutIds.length === 0) return {};
  const { data, error } = await supabase
    .from('workout_exercises')
    .select(
      'workout_id, position, notes, exercises(id, name, kind, gif_id, primary_muscle, secondary_muscles), workout_sets(position, set_type, weight_kg, reps, duration_s, distance_m, is_pr)'
    )
    .in('workout_id', workoutIds)
    .order('position');
  if (error) throw error;
  const out: Record<string, ExerciseLog[]> = {};
  type Row = {
    workout_id: string;
    notes: string | null;
    exercises: {
      id: string;
      name: string;
      kind: ExerciseKind;
      gif_id: string | null;
      primary_muscle: string;
      secondary_muscles: string[];
    } | null;
    workout_sets: (LoggedSet & { position: number })[];
  };
  for (const row of (data ?? []) as unknown as Row[]) {
    if (!row.exercises) continue;
    (out[row.workout_id] ??= []).push({
      name: row.exercises.name,
      kind: row.exercises.kind,
      exercise_id: row.exercises.id,
      gif_id: row.exercises.gif_id,
      primary_muscle: row.exercises.primary_muscle,
      secondary_muscles: row.exercises.secondary_muscles,
      notes: row.notes,
      sets: [...row.workout_sets].sort((a, b) => a.position - b.position),
    });
  }
  return out;
}

/** One set in words, e.g. "80 kg × 8" (or "176.4 lb × 8") or "5 km in 25m". */
export function describeSet(kind: ExerciseKind, s: LoggedSet, u: WeightUnit): string {
  switch (kind) {
    case 'weight_reps':
      return `${weightNumber(s.weight_kg ?? 0, u)} ${u} × ${s.reps}`;
    case 'bodyweight_reps':
      return s.weight_kg ? `+${weightNumber(s.weight_kg, u)} ${u} × ${s.reps}` : `${s.reps} reps`;
    case 'duration':
      return formatDuration(s.duration_s ?? 0);
    case 'distance_time':
      return `${Number(s.distance_m ?? 0) / 1000} km in ${formatDuration(s.duration_s ?? 0)}`;
  }
}

/**
 * The working sets of one exercise in a line: "3 × 8 @ 80 kg" when they match,
 * "80 kg × 8, 8, 6" at one weight, "60×10, 80×8, 85×6 kg" otherwise. Warm-ups are left out.
 */
export function summarizeSets(kind: ExerciseKind, sets: LoggedSet[], u: WeightUnit): string {
  const work = sets.filter((s) => s.set_type !== 'warmup');
  if (work.length === 0) return sets.length ? `${sets.length} warm-up set${sets.length > 1 ? 's' : ''}` : 'No sets';
  const w = (s: LoggedSet) => weightNumber(s.weight_kg ?? 0, u);
  const weights = new Set(work.map(w));
  const reps = new Set(work.map((s) => s.reps ?? 0));
  if (kind === 'weight_reps' || (kind === 'bodyweight_reps' && !weights.has(0))) {
    const unit = kind === 'bodyweight_reps' ? `+${w(work[0])} ${u}` : `${w(work[0])} ${u}`;
    if (weights.size === 1 && reps.size === 1) return `${work.length} × ${work[0].reps} @ ${unit}`;
    if (weights.size === 1) return `${unit} × ${work.map((s) => s.reps).join(', ')}`;
    return `${work.map((s) => `${w(s)}×${s.reps}`).join(', ')} ${u}`;
  }
  if (kind === 'bodyweight_reps') {
    return reps.size === 1 ? `${work.length} × ${work[0].reps} reps` : `${work.map((s) => s.reps).join(', ')} reps`;
  }
  const each = work.map((s) => describeSet(kind, s, u));
  return new Set(each).size === 1 && each.length > 1 ? `${each.length} × ${each[0]}` : each.join(', ');
}

export interface RoutineDraftExercise {
  exercise_id: string;
  target_sets: number;
  target_reps: string;
  rest_seconds: number;
}

/** `shown` holds the exercises themselves, so the routine can be displayed before it has been sent. */
export function saveRoutine(params: { id?: string; name: string; exercises: RoutineDraftExercise[]; shown: Exercise[] }) {
  const routineId = params.id ?? newId();
  const updated_at = new Date().toISOString();
  if (params.id) {
    enqueue({ kind: 'update', table: 'routines', values: { name: params.name, updated_at }, match: { id: routineId } });
    enqueue({ kind: 'delete', table: 'routine_exercises', match: { routine_id: routineId } });
  } else {
    enqueue({ kind: 'insert', table: 'routines', values: { id: routineId, name: params.name, notes: null, updated_at } });
  }
  if (params.exercises.length) {
    enqueue(
      {
        kind: 'insert',
        table: 'routine_exercises',
        values: params.exercises.map((e, i) => ({ ...e, id: newId(), routine_id: routineId, position: i + 1 })),
      },
      { shown: params.shown }
    );
  }
  return routineId;
}

/** Routines with what's still waiting to be sent applied. For useQuery's `overlay`. */
export function routinesWithWaiting(routines: Routine[]): Routine[] {
  const entries = waitingEntries();
  if (entries.length === 0) return routines;
  let out = applyPending(routines as unknown as Record<string, unknown>[], entries, 'routines') as unknown as Routine[];
  for (const { op, failed, meta } of entries) {
    if (failed) continue;
    if (op.kind === 'delete' && op.table === 'routine_exercises') {
      out = out.map((r) => (r.id === op.match.routine_id ? { ...r, routine_exercises: [] } : r));
    } else if (op.kind === 'insert' && op.table === 'routine_exercises') {
      const shown = (meta?.shown ?? []) as Exercise[];
      const rows = (Array.isArray(op.values) ? op.values : [op.values]) as unknown as Routine['routine_exercises'];
      out = out.map((r) => {
        const mine = rows.filter((x) => (x as unknown as { routine_id: string }).routine_id === r.id);
        if (mine.length === 0 || mine.every((m) => r.routine_exercises?.some((e) => e.id === m.id))) return r;
        return {
          ...r,
          routine_exercises: mine.map((m) => ({ ...m, exercises: shown.find((e) => e.id === m.exercise_id) ?? null })),
        } as Routine;
      });
    }
  }
  return out.map((r) => ({ ...r, routine_exercises: r.routine_exercises ?? [] }));
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
