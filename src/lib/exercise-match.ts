/**
 * Matching exercise names across naming styles: Hevy's "Bicep Curl (Dumbbell)", the library's
 * "Biceps Curl (Dumbbell)", "Pull Up" vs "Pull-Up". Used to map imported or custom exercises onto
 * the library instead of keeping duplicates.
 */

const EQUIPMENT: Record<string, string> = {
  barbell: 'barbell',
  bb: 'barbell',
  dumbbell: 'dumbbell',
  dumbbells: 'dumbbell',
  db: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
  lever: 'machine',
  leverage: 'machine',
  sled: 'machine',
  smith: 'smith',
  kettlebell: 'kettlebell',
  kb: 'kettlebell',
  band: 'band',
  bands: 'band',
  resistance: 'band',
  ez: 'ez',
  ezbar: 'ez',
  trap: 'trap',
  bodyweight: 'bodyweight',
  weighted: 'weighted',
  assisted: 'assisted',
};

// Spellings of the same word, folded to one.
const SAME: Record<string, string> = {
  biceps: 'bicep',
  triceps: 'tricep',
  pulldown: 'pulldown',
  pullup: 'pullup',
  pullups: 'pullup',
  chinup: 'chinup',
  chinups: 'chinup',
  pushup: 'pushup',
  pushups: 'pushup',
  pushdown: 'pushdown',
  situp: 'situp',
  situps: 'situp',
  flye: 'fly',
  flyes: 'fly',
  flies: 'fly',
  flys: 'fly',
  delts: 'delt',
  deltoid: 'delt',
  deltoids: 'delt',
  running: 'run',
  runs: 'run',
  extensions: 'extension',
  raises: 'raise',
  curls: 'curl',
  rows: 'row',
  squats: 'squat',
  lunges: 'lunge',
  crunches: 'crunch',
  presses: 'press',
  dips: 'dip',
  shrugs: 'shrug',
  deadlifts: 'deadlift',
  calves: 'calf',
  overhead: 'overhead',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
};

// Joined forms first, so "pull up" and "pull-up" both become "pullup".
const JOIN: [RegExp, string][] = [
  [/\bpull[\s-]?downs?\b/g, 'pulldown'],
  [/\bpull[\s-]?ups?\b/g, 'pullup'],
  [/\bchin[\s-]?ups?\b/g, 'chinup'],
  [/\bpush[\s-]?ups?\b/g, 'pushup'],
  [/\bpush[\s-]?downs?\b/g, 'pushdown'],
  [/\bsit[\s-]?ups?\b/g, 'situp'],
  [/\bskull[\s-]?crushers?\b/g, 'skullcrusher'],
  [/\bez[\s-]?bar\b/g, 'ez'],
  [/\bsmith machine\b/g, 'smith'],
  [/\bmachine plates?\b/g, 'machine'],
  [/\bplate[\s-]?loaded\b/g, 'machine'],
  [/\btrap bar\b/g, 'trap'],
  [/\bresistance band\b/g, 'band'],
  [/&/g, ' and '],
];

// Words that don't change which exercise it is.
const FILLER = new Set(['the', 'a', 'and', 'with', 'on', 'of', 'to', 'exercise', 'standard', 'regular', 'normal']);

/** The key a name is stored under in exercise_aliases. Keep in step with exercise_alias_key in the database. */
export const aliasKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

export interface NameParts {
  /** The movement's words, folded and sorted ("curl hammer"). */
  words: string[];
  /** Equipment named anywhere in the name, if any. */
  equipment: string | null;
}

// Names are compared against the whole library, so each is only taken apart once.
const partsCache = new Map<string, NameParts>();

export function nameParts(name: string): NameParts {
  const cached = partsCache.get(name);
  // A copy, because callers fill in equipment.
  if (cached) return { words: cached.words, equipment: cached.equipment };
  let s = name.toLowerCase();
  for (const [re, to] of JOIN) s = s.replace(re, to);
  const words: string[] = [];
  let equipment: string | null = null;
  for (const raw of s.split(/[^a-z0-9]+/).filter(Boolean)) {
    const eq = EQUIPMENT[raw];
    if (eq) {
      // "Weighted" and "assisted" only count when nothing more specific is named.
      if (!equipment || equipment === 'weighted' || equipment === 'assisted') equipment = eq;
      continue;
    }
    for (const w of (SAME[raw] ?? raw).split(' ')) if (!FILLER.has(w)) words.push(w);
  }
  const parts = { words: [...new Set(words)].sort(), equipment };
  partsCache.set(name, parts);
  return { words: parts.words, equipment: parts.equipment };
}

/**
 * How alike two names are, 0 to 1; 0 when they name different equipment. An exercise's equipment
 * field stands in when its name leaves the equipment out ("Leg Extension" on a machine).
 */
export function nameScore(a: string, b: string, aEquipment?: string, bEquipment?: string): number {
  const pa = nameParts(a);
  const pb = nameParts(b);
  // Only to compare against equipment the other name states; two names that both leave it out are already alike.
  if (!pa.equipment && pb.equipment) pa.equipment = EQUIPMENT[aEquipment ?? ''] ?? null;
  if (!pb.equipment && pa.equipment) pb.equipment = EQUIPMENT[bEquipment ?? ''] ?? null;
  if (pa.equipment && pb.equipment && pa.equipment !== pb.equipment) return 0;
  const A = new Set(pa.words);
  const B = new Set(pb.words);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  const jaccard = shared / (A.size + B.size - shared);
  // One side naming equipment the other leaves out is a small doubt, not a mismatch.
  const equipmentPenalty = pa.equipment === pb.equipment ? 0 : 0.1;
  return Math.max(0, jaccard - equipmentPenalty);
}

export interface Candidate {
  id: string;
  name: string;
  kind?: string;
  equipment?: string;
}

export interface ExerciseMatch<T extends Candidate> {
  match: T;
  score: number;
  /** Exactly the same name and way of logging: the only match used without asking. */
  exact: boolean;
}

/** The key for "exactly the same name": only upper/lower case and surrounding spaces are ignored. */
export const exactKey = (name: string) => name.trim().toLowerCase();

export const sameName = (a: string, b: string) => exactKey(a) === exactKey(b);

/** The library exercise a name most likely means, or null when nothing is close enough to suggest. */
export function bestMatch<T extends Candidate>(
  name: string,
  kind: string | undefined,
  library: T[],
  { equipment, minScore = 0.6 }: { equipment?: string; minScore?: number } = {}
): ExerciseMatch<T> | null {
  const same = library.find((e) => sameName(name, e.name) && (!kind || !e.kind || kind === e.kind));
  if (same) return { match: same, score: 1, exact: true };
  let best: ExerciseMatch<T> | null = null;
  for (const e of library) {
    let score = nameScore(name, e.name, equipment, e.equipment);
    // A different kind (weights vs bodyweight vs timed) logs differently; only suggest it when nothing else fits.
    if (kind && e.kind && kind !== e.kind) score -= 0.15;
    if (score < minScore) continue;
    if (!best || score > best.score || (score === best.score && e.name.length < best.match.name.length)) {
      best = { match: e, score, exact: false };
    }
  }
  return best;
}

export interface MergeSuggestion<T extends Candidate> {
  custom: T;
  match: T;
  score: number;
  /** Exactly the same name: merged without asking. Anything else waits for a person to choose it. */
  sure: boolean;
}

/**
 * For each custom exercise, the library exercise it most likely is. `aliases` holds past choices
 * (alias key -> exercise id), which are suggested first but never count as sure.
 */
export function suggestMerges<T extends Candidate>(
  customs: T[],
  library: T[],
  aliases: ReadonlyMap<string, string> = new Map()
): MergeSuggestion<T>[] {
  const byId = new Map(library.map((e) => [e.id, e]));
  const out: MergeSuggestion<T>[] = [];
  for (const custom of customs) {
    const m = bestMatch(custom.name, custom.kind, library, { equipment: custom.equipment });
    if (m?.exact) {
      out.push({ custom, match: m.match, score: 1, sure: true });
      continue;
    }
    const aliased = aliases.get(aliasKey(custom.name));
    const known = aliased ? byId.get(aliased) : undefined;
    if (known) out.push({ custom, match: known, score: 1, sure: false });
    else if (m) out.push({ custom, match: m.match, score: m.score, sure: false });
  }
  return out.sort((a, b) => Number(b.sure) - Number(a.sure) || b.score - a.score);
}
