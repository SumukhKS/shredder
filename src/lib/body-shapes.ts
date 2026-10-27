/**
 * Muscle groups for the muscle map, and which parts of the anatomical figure
 * (react-native-body-highlighter's male body) light up for each.
 */
export type Muscle =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'traps'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core';

/** Figure parts for each muscle group (the package's slugs, front and back views together). */
export const MUSCLE_PARTS: Record<Muscle, string[]> = {
  chest: ['chest'],
  back: ['upper-back', 'lower-back'],
  shoulders: ['deltoids'],
  traps: ['trapezius'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  quads: ['quadriceps', 'adductors'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  calves: ['calves', 'tibialis'],
  core: ['abs', 'obliques'],
};

/** Muscle groups by body region, in the order the map's legend lists them. */
export const MUSCLE_REGIONS: { title: string; muscles: Muscle[] }[] = [
  { title: 'Chest', muscles: ['chest'] },
  { title: 'Back', muscles: ['back', 'traps'] },
  { title: 'Shoulders', muscles: ['shoulders'] },
  { title: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { title: 'Core', muscles: ['core'] },
  { title: 'Legs', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
];

export interface MuscleLoad {
  /** Working sets where this was the main muscle. */
  primary: number;
  /** Working sets where it helped. */
  secondary: number;
  /** Weight × reps of those sets in kg, with sets where it only helped counted at half. */
  volume: number;
}

// Checked in order, so the specific names ("leg curl", "upright row") come before the general ones ("curl", "row").
const NAME_RULES: [RegExp, Muscle | 'cardio'][] = [
  [/lunge/, 'quads'],
  [
    /\b(run|running|jog|treadmill|cycl|bike|elliptical|rowing machine|rower|swim|walk|stair|jump rope|skipping|cardio|hiit)/,
    'cardio',
  ],
  [/wrist|forearm|farmer|grip/, 'forearms'],
  [/leg curl|hamstring|romanian|\brdl\b|stiff.?leg|good morning|nordic/, 'hamstrings'],
  [/tricep|skull|push.?down|close.?grip bench|overhead extension|\bdips?\b/, 'triceps'],
  [/curl|bicep/, 'biceps'],
  [
    /upright row|face pull|lateral raise|front raise|rear delt|reverse fly|shoulder|overhead press|military|arnold|\bohp\b|delt/,
    'shoulders',
  ],
  [/shrug|trap/, 'traps'],
  [/calf|calves/, 'calves'],
  [/hip thrust|glute|kickback|bridge|abduct/, 'glutes'],
  [/squat|leg press|lunge|leg extension|step.?up|hack|adduct|quad|sissy/, 'quads'],
  [/bench|chest|fly|flye|push.?up|pec|crossover|incline|decline|\bpress\b/, 'chest'],
  [
    /crunch|plank|sit.?up|\babs?\b|leg raise|knee raise|twist|core|oblique|ab wheel|rollout|hollow|v.?up|mountain climber/,
    'core',
  ],
  [/row|pull.?down|pull.?up|\blat\b|lats|pullover|deadlift|back extension|hyperextension|back/, 'back'],
];

/** A best guess at the main muscle from an exercise's name, for exercises saved without one. */
export function inferMuscle(name: string): Muscle | 'cardio' | null {
  const n = name.toLowerCase();
  return NAME_RULES.find(([re]) => re.test(n))?.[1] ?? null;
}

type ExerciseMuscles = {
  name?: string;
  primary_muscle?: string;
  secondary_muscles?: string[];
  sets: { set_type: string; weight_kg?: number | null; reps?: number | null }[];
};

/** The exercise's main muscle (or 'cardio'), guessed from its name when it was saved as 'other'. */
export function mainMuscle(e: ExerciseMuscles): Muscle | 'cardio' | null {
  const m = e.primary_muscle;
  if (m && (m === 'cardio' || isMuscle(m))) return m;
  return e.name ? inferMuscle(e.name) : null;
}

/** How hard each muscle worked in a session, counting working sets (warm-ups don't count). */
export function muscleLoad(exercises: ExerciseMuscles[]): Partial<Record<Muscle, MuscleLoad>> {
  const out: Partial<Record<Muscle, MuscleLoad>> = {};
  const add = (m: string | null | undefined, key: 'primary' | 'secondary', sets: number, volume: number) => {
    if (!m || !isMuscle(m) || sets === 0) return;
    const l = (out[m] ??= { primary: 0, secondary: 0, volume: 0 });
    l[key] += sets;
    l.volume += key === 'primary' ? volume : volume / 2;
  };
  for (const e of exercises) {
    const working = e.sets.filter((s) => s.set_type !== 'warmup');
    const volume = working.reduce((v, s) => v + Number(s.weight_kg ?? 0) * Number(s.reps ?? 0), 0);
    const main = mainMuscle(e);
    add(main, 'primary', working.length, volume);
    for (const m of e.secondary_muscles ?? []) if (m !== main) add(m, 'secondary', working.length, volume);
  }
  return out;
}

const ALL_MUSCLES = new Set<string>(MUSCLE_REGIONS.flatMap((r) => r.muscles));
export const isMuscle = (m: string): m is Muscle => ALL_MUSCLES.has(m);
