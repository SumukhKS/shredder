import { addDays, mondayOf, toDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/stores/session';

/**
 * Re-read the profile after logging something. The server keeps the daily streak
 * (any logged food, water, steps, sleep, weigh-in or workout counts for the day).
 */
export async function refreshStreaks() {
  // Only refreshes the numbers on screen, so no connection isn't a failure.
  await useSession
    .getState()
    .refreshProfile()
    .catch(() => null);
}

/** Every week with a workout (its Monday), newest first. Counted on the server, so large histories aren't cut off. */
export async function fetchWorkoutWeeks(): Promise<string[]> {
  const { data, error } = await supabase.rpc('profile_stats', { p_today: toDay() });
  if (error) throw error;
  return (data as { weeks: string[] }).weeks;
}

/**
 * Weekly streak: consecutive weeks (Monday to Sunday) with at least one workout.
 * The current week doesn't break it until it's over, so a streak survives until Sunday.
 */
export function weekStreaks(weeks: string[], today = toDay()) {
  const has = new Set(weeks);
  const thisWeek = mondayOf(today);
  let current = 0;
  let week = has.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  while (has.has(week)) {
    current++;
    week = addDays(week, -7);
  }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of [...weeks].sort()) {
    run = prev && addDays(prev, 7) === w ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return { current, best, thisWeekDone: has.has(thisWeek) };
}
