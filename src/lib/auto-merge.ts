import { aliasKey, suggestMerges } from '@/lib/exercise-match';
import { supabase } from '@/lib/supabase';
import { fetchExercises } from '@/lib/workouts';

const LAST_RUN_KEY = 'shredder.autoMerge';

/** Known renames and your own past choices: alias key -> exercise id. Your own win. */
export async function fetchAliases(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('exercise_aliases').select('alias_key, exercise_id, user_id');
  if (error) throw error;
  const rows = (data ?? []) as { alias_key: string; exercise_id: string; user_id: string | null }[];
  return new Map([...rows.filter((r) => !r.user_id), ...rows.filter((r) => r.user_id)].map((r) => [r.alias_key, r.exercise_id]));
}

/** Remember that an imported name means this exercise. */
export async function saveAlias(userId: string, name: string, exerciseId: string) {
  const { error } = await supabase
    .from('exercise_aliases')
    .upsert({ alias_key: aliasKey(name), exercise_id: exerciseId, user_id: userId }, { onConflict: 'user_id,alias_key' });
  if (error) throw error;
}

/** Fold the given custom exercises into library ones; returns how many were merged. */
export async function mergeExercises(pairs: { from: string; to: string }[]): Promise<number> {
  if (!pairs.length) return 0;
  const { data, error } = await supabase.rpc('merge_exercises', { p_pairs: pairs });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Custom exercises that are certainly library ones (same name under another spelling, or a known
 * Hevy rename) are merged into the library without asking, so their history, PRs and routines
 * use the library exercise. Close-but-unsure matches are left for the Match to library screen.
 * Runs at most once a day unless `force`; returns how many were merged.
 */
export async function autoMergeExercises(userId: string, force = false): Promise<number> {
  const today = new Date().toDateString();
  if (!force && localStorage.getItem(LAST_RUN_KEY) === `${userId}|${today}`) return 0;
  const [all, aliases] = await Promise.all([fetchExercises(), fetchAliases()]);
  const customs = all.filter((e) => e.created_by === userId);
  let merged = 0;
  if (customs.length) {
    const sure = suggestMerges(
      customs,
      all.filter((e) => !e.created_by),
      aliases
    ).filter((s) => s.sure);
    merged = await mergeExercises(sure.map((s) => ({ from: s.custom.id, to: s.match.id })));
  }
  localStorage.setItem(LAST_RUN_KEY, `${userId}|${today}`);
  return merged;
}
