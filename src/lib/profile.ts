import { File } from 'expo-file-system';

import { mondayOf, toDay } from '@/lib/dates';
import { enqueue, waitingEntries } from '@/lib/outbox';
import { applyPending } from '@/lib/outbox-core';
import type { ProfileStats } from '@/lib/profile-stats';
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
  const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: mimeType });
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
export function saveBodyMetrics(userId: string, day: string, values: Partial<Record<Measure, number | null>>) {
  enqueue({ kind: 'upsert', table: 'body_metrics', values: { user_id: userId, day, ...values }, onConflict: 'user_id,day' });
}

/** Measurements with what's still waiting to be sent applied, oldest first. For useQuery's `overlay`. */
export function metricsWithWaiting(rows: BodyMetric[]): BodyMetric[] {
  const entries = waitingEntries();
  if (entries.length === 0) return rows;
  const merged = applyPending(rows as unknown as Record<string, unknown>[], entries, 'body_metrics') as unknown as BodyMetric[];
  return [...merged].sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Save imported rows. Rows are grouped by which columns they hold, because the server would blank
 * any column a row in the same request leaves out, and an empty cell must not erase a saved value.
 */
export async function importBodyMetrics(userId: string, rows: { day: string; values: Record<string, number> }[]) {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const key = Object.keys(r.values).sort().join();
    groups.set(key, [...(groups.get(key) ?? []), { user_id: userId, day: r.day, ...r.values }]);
  }
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 200) {
      const { error } = await supabase.from('body_metrics').upsert(group.slice(i, i + 200), { onConflict: 'user_id,day' });
      if (error) throw error;
    }
  }
}

export interface ProfileTotals {
  workouts: number;
  /** Days with any food logged. */
  dietDays: number;
  /** Days the step goal was reached. */
  stepGoalDays: number;
  weekStreak: number;
}

/** Lifetime numbers and every recent day, counted on the server so large histories aren't cut off. */
export async function fetchProfileStats(): Promise<ProfileStats> {
  const { data, error } = await supabase.rpc('profile_stats', { p_today: toDay() });
  if (error) throw error;
  return data as ProfileStats;
}

/** Every exercise done this week, for the muscle map. */
export async function fetchWeekExercises(): Promise<ExerciseLog[]> {
  const today = toDay();
  const { data, error } = await supabase.from('workouts').select('id').gte('day', mondayOf(today)).lte('day', today);
  if (error) throw error;
  const byWorkout = await fetchWorkoutExercises((data ?? []).map((x) => x.id as string));
  return Object.values(byWorkout).flat();
}
