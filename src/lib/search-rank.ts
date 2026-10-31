/**
 * Orders search results by how well the name fits what was typed. Nothing is filtered out here:
 * a result that only matched on something else (a food's brand) goes last.
 */

/** The lifts most people mean, so "dead" finds Deadlift before Dead Bug. */
const STAPLES = [
  'deadlift',
  'squat',
  'bench press',
  'overhead press',
  'shoulder press',
  'pulldown',
  'pull up',
  'chin up',
  'push up',
  'bent over row',
  'seated row',
  'barbell row',
  'bicep curl',
  'biceps curl',
  'hammer curl',
  'leg press',
  'leg curl',
  'leg extension',
  'lunge',
  'hip thrust',
  'lateral raise',
  'pushdown',
  'dip',
  'calf raise',
  'face pull',
  'plank',
  'crunch',
].map((s) => s.split(' '));

/** Lower case, with hyphens, brackets and other punctuation as plain spaces. */
const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9°]+/)
    .filter(Boolean);

function isRun(words: string[], run: string[]): boolean {
  for (let i = 0; i + run.length <= words.length; i++) {
    if (run.every((w, j) => words[i + j] === w || words[i + j] === `${w}s`)) return true;
  }
  return false;
}

/** A staple named in `name` that the typed words begin (for "dead", the "deadlift" in "Romanian Deadlift"). */
function namesStaple(words: string[], typed: string[]): boolean {
  return STAPLES.some((staple) => typed.every((t) => staple.some((w) => w.startsWith(t))) && isRun(words, staple));
}

/** 0 is the best fit: exact, then (with `staples`) a staple lift, name starts with it, a word starts with it, contains it, no match. */
export function searchTier(name: string, query: string, { staples = false }: { staples?: boolean } = {}): number {
  const words = wordsOf(name);
  const typed = wordsOf(query);
  if (!typed.length) return 5;
  const n = words.join(' ');
  const q = typed.join(' ');
  if (n === q) return 0;
  if (staples && namesStaple(words, typed)) return 1;
  if (n.startsWith(q)) return 2;
  if (typed.every((t) => words.some((w) => w.startsWith(t)))) return 3;
  if (typed.every((t) => n.includes(t))) return 4;
  return 5;
}

/** Best fit first; within a fit, names starting with what was typed, then shorter names, then A to Z. */
export function rankBySearch<T>(items: T[], query: string, nameOf: (item: T) => string, options?: { staples?: boolean }): T[] {
  const q = wordsOf(query).join(' ');
  if (!q) return items;
  return items
    .map((item) => {
      const name = nameOf(item);
      return { item, name, tier: searchTier(name, query, options), starts: wordsOf(name).join(' ').startsWith(q) ? 0 : 1 };
    })
    .sort((a, b) => a.tier - b.tier || a.starts - b.starts || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .map((r) => r.item);
}

/** The same order for the exercise library, where staple lifts come first. */
export const rankExercises = <T extends { name: string }>(items: T[], query: string) =>
  rankBySearch(items, query, (e) => e.name, { staples: true });
