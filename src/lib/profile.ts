import { File } from 'expo-file-system';

import { addDays, mondayOf, toDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { fetchWorkoutExercises, type ExerciseLog } from '@/lib/workouts';
import type { BodyMetric } from '@/types/db';

/**
 * Upload a picked photo as the profile picture (avatars/<user id>/<time>.jpg) and return its
 * public address. A new name each time, so the old picture isn't served from a cache.
 */
export async function uploadAvatar(userId: string, uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const body = await new File(uri).arrayBuffer();
  const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: mimeType, upsert: true });
  if (error) throw error;
  // Older pictures are no longer used.
  const { data: old } = await supabase.storage.from('avatars').list(userId);
  const stale = (old ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== path);
  if (stale.length) await supabase.storage.from('avatars').remove(stale);
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

/** Age in whole years on `today` from a YYYY-MM-DD birthday. */
export function ageFrom(birthday: string, today = toDay()): number {
  const [y, m, d] = birthday.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

export type Measure = Exclude<keyof BodyMetric, 'day'>;

/** Every body measurement the app logs, in the order the log form shows them. */
export const MEASURES: { key: Measure; label: string; kind: 'weight' | 'percent' | 'length' }[] = [
  { key: 'weight_kg', label: 'Body weight', kind: 'weight' },
  { key: 'body_fat_pct', label: 'Body fat', kind: 'percent' },
  { key: 'neck_cm', label: 'Neck', kind: 'length' },
  { key: 'shoulders_cm', label: 'Shoulders', kind: 'length' },
  { key: 'chest_cm', label: 'Chest', kind: 'length' },
  { key: 'waist_cm', label: 'Waist', kind: 'length' },
  { key: 'hips_cm', label: 'Hips', kind: 'length' },
  { key: 'arm_cm', label: 'Arm (biceps)', kind: 'length' },
  { key: 'forearm_cm', label: 'Forearm', kind: 'length' },
  { key: 'thigh_cm', label: 'Thigh', kind: 'length' },
  { key: 'calf_cm', label: 'Calf', kind: 'length' },
];

const METRIC_COLUMNS = `day, ${MEASURES.map((m) => m.key).join(', ')}`;

/** Body measurements, oldest first. */
export async function fetchBodyMetrics(limit = 365): Promise<BodyMetric[]> {
  const { data, error } = await supabase
    .from('body_metrics')
    .select(METRIC_COLUMNS)
    .order('day', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as BodyMetric[]).reverse();
}

/** Save some measurements for a day; the ones left out keep their values. Weight in kg, lengths in cm. */
export async function saveBodyMetrics(userId: string, day: string, values: Partial<Record<Measure, number | null>>) {
  const { error } = await supabase
    .from('body_metrics')
    .upsert({ user_id: userId, day, ...values }, { onConflict: 'user_id,day' });
  if (error) throw error;
}

export interface ProfileTotals {
  workouts: number;
  /** Days with any food logged. */
  dietDays: number;
  /** Days the step goal was reached. */
  stepGoalDays: number;
  /** The same three, for each of the last `weeks` weeks (Monday first), oldest first. */
  weekly: { week: string; workouts: number; dietDays: number; stepGoalDays: number }[];
}

/** Lifetime counts for the profile header, and how they spread over recent weeks. */
export async function fetchProfileTotals(stepsTarget: number, weeks = 12): Promise<ProfileTotals> {
  const [workouts, food, health] = await Promise.all([
    supabase.from('workouts').select('day').limit(10000),
    supabase.from('daily_nutrition').select('day').limit(10000),
    supabase.from('daily_health').select('day, steps').gte('steps', Math.max(1, stepsTarget)).limit(10000),
  ]);
  if (workouts.error) throw workouts.error;
  const workoutDays = (workouts.data ?? []).map((r) => r.day as string);
  const dietDays = [...new Set((food.data ?? []).map((r) => r.day as string))];
  const stepDays = (health.data ?? []).map((r) => r.day as string);

  const thisWeek = mondayOf(toDay());
  const weekly = Array.from({ length: weeks }, (_, i) => {
    const week = addDays(thisWeek, -7 * (weeks - 1 - i));
    const end = addDays(week, 6);
    const inWeek = (d: string) => d >= week && d <= end;
    return {
      week,
      workouts: workoutDays.filter(inWeek).length,
      dietDays: dietDays.filter(inWeek).length,
      stepGoalDays: stepDays.filter(inWeek).length,
    };
  });
  return { workouts: workoutDays.length, dietDays: dietDays.length, stepGoalDays: stepDays.length, weekly };
}

export interface Dashboard {
  /** This week (Monday on), with every exercise done, for the muscle map. */
  week: { workouts: number; sets: number; volume: number; durationS: number; exercises: ExerciseLog[] };
  /** The last 7 days, oldest first; null where nothing was logged. */
  days: {
    day: string;
    kcal: number | null;
    protein: number | null;
    steps: number | null;
    sleepMin: number | null;
    waterMl: number;
  }[];
}

/** Workout, diet, sleep, steps and water numbers for the Profile dashboard. */
export async function fetchDashboard(): Promise<Dashboard> {
  const today = toDay();
  const monday = mondayOf(today);
  const from = addDays(today, -6);
  const [w, food, health, water] = await Promise.all([
    supabase.from('workouts').select('id, duration_s, total_volume, total_sets').gte('day', monday).lte('day', today),
    supabase.from('daily_nutrition').select('day, kcal, protein').gte('day', from).lte('day', today),
    supabase.from('daily_health').select('day, steps, sleep_min').gte('day', from).lte('day', today),
    supabase.from('water_logs').select('day, ml').gte('day', from).lte('day', today),
  ]);
  if (w.error) throw w.error;
  const workouts = w.data ?? [];
  const byWorkout = await fetchWorkoutExercises(workouts.map((x) => x.id as string));
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(from, i);
    const f = (food.data ?? []).find((r) => r.day === day);
    const h = (health.data ?? []).find((r) => r.day === day);
    return {
      day,
      kcal: f ? Number(f.kcal) : null,
      protein: f ? Number(f.protein) : null,
      steps: h?.steps ?? null,
      sleepMin: h?.sleep_min ?? null,
      waterMl: (water.data ?? []).filter((r) => r.day === day).reduce((n, r) => n + Number(r.ml), 0),
    };
  });
  return {
    week: {
      workouts: workouts.length,
      sets: workouts.reduce((n, x) => n + Number(x.total_sets ?? 0), 0),
      volume: workouts.reduce((n, x) => n + Number(x.total_volume ?? 0), 0),
      durationS: workouts.reduce((n, x) => n + Number(x.duration_s ?? 0), 0),
      exercises: Object.values(byWorkout).flat(),
    },
    days,
  };
}
