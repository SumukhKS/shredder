import { supabase } from '@/lib/supabase';
import type { DailyHealth, FoodLog } from '@/types/db';

export interface DaySnapshot {
  logs: FoodLog[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  waterMl: number;
  health: DailyHealth | null;
  workedOut: boolean;
}

export async function fetchDay(day: string): Promise<DaySnapshot> {
  const [logs, water, health, workouts] = await Promise.all([
    supabase.from('food_logs').select('*').eq('day', day).order('created_at'),
    supabase.from('water_logs').select('ml').eq('day', day),
    supabase.from('daily_health').select('day, steps, sleep_min').eq('day', day).maybeSingle(),
    supabase.from('workouts').select('id', { count: 'exact', head: true }).eq('day', day),
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
    workedOut: (workouts.count ?? 0) > 0,
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

export async function saveHealth(userId: string, day: string, patch: { steps?: number | null; sleep_min?: number | null }) {
  const { error } = await supabase
    .from('daily_health')
    .upsert({ user_id: userId, day, ...patch, source: 'manual', updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' });
  if (error) throw error;
}
