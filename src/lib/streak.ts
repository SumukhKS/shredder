import { addDays, mondayOf, toDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/stores/session';
import type { Profile } from '@/types/db';

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

/** The daily streak as it stands today: it lapses once a whole day passes with nothing logged. */
export function dayStreak(profile: Pick<Profile, 'current_streak' | 'last_active_day'>, today = toDay()) {
  if (!profile.last_active_day) return 0;
  return profile.last_active_day >= addDays(today, -1) ? profile.current_streak : 0;
}

/** Mondays of every week with at least one workout, newest first. */
export async function fetchWorkoutWeeks(): Promise<string[]> {
  const { data } = await supabase.from('workouts').select('day').order('day', { ascending: false }).limit(2000);
  const weeks = new Set(((data ?? []) as { day: string }[]).map((w) => mondayOf(w.day)));
  return [...weeks].sort().reverse();
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
