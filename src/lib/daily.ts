import { addDays } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import type { DailyHealth, FoodLog, WorkoutSummary } from '@/types/db';

export interface DaySnapshot {
  logs: FoodLog[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  waterMl: number;
  health: DailyHealth | null;
  workedOut: boolean;
  workouts: WorkoutSummary[];
}

export async function fetchDay(day: string): Promise<DaySnapshot> {
  const [logs, water, health, workouts] = await Promise.all([
    supabase.from('food_logs').select('*').eq('day', day).order('created_at'),
    supabase.from('water_logs').select('ml').eq('day', day),
    supabase.from('daily_health').select('day, steps, sleep_min, source').eq('day', day).maybeSingle(),
    supabase
      .from('workouts')
      .select('id, name, day, started_at, duration_s, total_volume, total_sets, pr_count')
      .eq('day', day)
      .order('started_at'),
  ]);
  if (logs.error) throw logs.error;

  const rows = (logs.data ?? []) as FoodLog[];
  const totals = rows.reduce(
    (t, l) => ({
      kcal: t.kcal + Number(l.kcal),
      protein: t.protein + Number(l.protein),
      carbs: t.carbs + Number(l.carbs),
      fat: t.fat + Number(l.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return {
    logs: rows,
    totals,
    waterMl: (water.data ?? []).reduce((s, w) => s + Number(w.ml), 0),
    health: (health.data as DailyHealth | null) ?? null,
    workedOut: (workouts.data ?? []).length > 0,
    workouts: (workouts.data ?? []) as WorkoutSummary[],
  };
}

export async function addWater(day: string, ml: number) {
  const { error } = await supabase.from('water_logs').insert({ day, ml });
  if (error) throw error;
}

/** Removes the most recent water entry for the day (undo for the quick-add buttons). */
export async function undoWater(day: string) {
  const { data } = await supabase
    .from('water_logs')
    .select('id')
    .eq('day', day)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) await supabase.from('water_logs').delete().eq('id', data.id);
}

/** Replace the day's water with a single total (the logs are kept to 5 L per row). */
export async function setWaterTotal(day: string, ml: number) {
  const { error: delError } = await supabase.from('water_logs').delete().eq('day', day);
  if (delError) throw delError;
  const rows: { day: string; ml: number }[] = [];
  for (let left = Math.round(ml); left > 0; left -= 5000) rows.push({ day, ml: Math.min(left, 5000) });
  if (rows.length) {
    const { error } = await supabase.from('water_logs').insert(rows);
    if (error) throw error;
  }
}

export async function saveHealth(
  userId: string,
  day: string,
  patch: { steps?: number | null; sleep_min?: number | null },
  source: 'manual' | 'health_connect' = 'manual'
) {
  const { error } = await supabase
    .from('daily_health')
    .upsert({ user_id: userId, day, ...patch, source, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' });
  if (error) throw error;
}

export type Habit = 'water' | 'steps' | 'sleep';

/** One habit's value for each of the `days` days ending on `end` (oldest first; 0 when nothing was logged). */
export async function fetchHabitHistory(habit: Habit, end: string, days = 7): Promise<{ day: string; value: number }[]> {
  const span = Array.from({ length: days }, (_, i) => addDays(end, i - days + 1));
  const totals: Record<string, number> = {};
  if (habit === 'water') {
    const { data, error } = await supabase.from('water_logs').select('day, ml').gte('day', span[0]).lte('day', end);
    if (error) throw error;
    for (const r of data ?? []) totals[r.day] = (totals[r.day] ?? 0) + Number(r.ml);
  } else {
    const { data, error } = await supabase.from('daily_health').select('day, steps, sleep_min').gte('day', span[0]).lte('day', end);
    if (error) throw error;
    for (const r of data ?? []) totals[r.day] = Number((habit === 'steps' ? r.steps : r.sleep_min) ?? 0);
  }
  return span.map((day) => ({ day, value: totals[day] ?? 0 }));
}

export type CalendarKind = Habit | 'food' | 'workout';

/**
 * The days between `from` and `to` that the calendar highlights: a workout done, any food
 * logged, or the water, steps or sleep goal reached (`target` is that goal).
 */
export async function fetchMarkedDays(kind: CalendarKind, from: string, to: string, target = 0): Promise<Set<string>> {
  if (kind === 'workout' || kind === 'food') {
    const table = kind === 'workout' ? 'workouts' : 'food_logs';
    const { data, error } = await supabase.from(table).select('day').gte('day', from).lte('day', to);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.day as string));
  }
  const totals: Record<string, number> = {};
  if (kind === 'water') {
    const { data, error } = await supabase.from('water_logs').select('day, ml').gte('day', from).lte('day', to);
    if (error) throw error;
    for (const r of data ?? []) totals[r.day] = (totals[r.day] ?? 0) + Number(r.ml);
  } else {
    const { data, error } = await supabase.from('daily_health').select('day, steps, sleep_min').gte('day', from).lte('day', to);
    if (error) throw error;
    for (const r of data ?? []) totals[r.day] = Number((kind === 'steps' ? r.steps : r.sleep_min) ?? 0);
  }
  return new Set(Object.keys(totals).filter((d) => totals[d] > 0 && totals[d] >= target));
}
