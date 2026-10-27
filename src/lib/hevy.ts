import { toDay } from '@/lib/dates';
import { bestMatch } from '@/lib/exercise-match';
import { supabase } from '@/lib/supabase';
import { fetchExercises } from '@/lib/workouts';
import type { Exercise, ExerciseKind } from '@/types/db';

/**
 * Importing training history from Hevy, either through its API (Hevy Pro users paste an
 * API key) or from the workouts CSV any Hevy user can export on their phone. Both paths
 * produce the same HevyWorkout shape, which is then matched to Shredder exercises and
 * saved with the import_workouts RPC (no XP, duplicates skipped).
 */

export interface HevySet {
  type: 'normal' | 'warmup' | 'drop' | 'failure';
  weightKg: number | null;
  reps: number | null;
  distanceM: number | null;
  durationS: number | null;
  rpe: number | null;
}

export interface HevyExercise {
  title: string;
  templateId?: string;
  notes: string | null;
  sets: HevySet[];
}

export interface HevyWorkout {
  /** Start time to the minute: the same workout gets the same id from the API and the CSV. */
  externalId: string;
  name: string;
  startedAt: Date;
  finishedAt: Date;
  notes: string | null;
  exercises: HevyExercise[];
}

export interface HevyRoutine {
  id: string;
  name: string;
  exercises: { title: string; templateId?: string; targetSets: number; targetReps: string; restSeconds: number }[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  routines: number;
  newExercises: string[];
}

export type Progress = (message: string) => void;

const API = 'https://api.hevyapp.com/v1';
const BATCH = 20;

// ---------------------------------------------------------------------------
// Hevy API (Hevy Pro)
// ---------------------------------------------------------------------------

interface ApiSet {
  type: string;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  rep_range?: { start: number | null; end: number | null } | null;
}
interface ApiExercise {
  title: string;
  exercise_template_id: string;
  notes: string | null;
  rest_seconds?: number | null;
  sets: ApiSet[];
}
interface ApiWorkout {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  exercises: ApiExercise[];
}
interface ApiRoutine {
  id: string;
  title: string;
  exercises: ApiExercise[];
}
export interface ApiTemplate {
  id: string;
  title: string;
  type: string;
  primary_muscle_group: string;
  equipment: string;
}

async function hevyGet<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { 'api-key': apiKey, accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Hevy didn't accept that API key. Copy it again from hevy.com → Settings → Developer.");
  }
  if (res.status === 429) throw new Error('Hevy is limiting requests right now. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Hevy returned an error (${res.status}). Try again in a moment.`);
  return (await res.json()) as T;
}

async function allPages<T>(apiKey: string, path: string, key: string, pageSize: number, onPage?: (n: number) => void) {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await hevyGet<Record<string, unknown> & { page_count: number }>(
      apiKey,
      `${path}${sep}page=${page}&pageSize=${pageSize}`
    );
    out.push(...((data[key] as T[]) ?? []));
    onPage?.(out.length);
    if (page >= (data.page_count ?? 1)) return out;
  }
}

export async function fetchFromHevyApi(apiKey: string, progress: Progress) {
  progress('Connecting to Hevy…');
  const { workout_count: total } = await hevyGet<{ workout_count: number }>(apiKey, '/workouts/count');
  const workouts = await allPages<ApiWorkout>(apiKey, '/workouts', 'workouts', 10, (n) =>
    progress(`Downloading workouts from Hevy… ${n} of ${total}`)
  );
  progress('Downloading routines from Hevy…');
  const routines = await allPages<ApiRoutine>(apiKey, '/routines', 'routines', 10);
  return {
    workouts: workouts.map(fromApiWorkout),
    routines: routines.map(fromApiRoutine),
    template: (id: string) => hevyGet<ApiTemplate>(apiKey, `/exercise_templates/${id}`),
  };
}

function fromApiSet(s: ApiSet): HevySet {
  return {
    type: setType(s.type),
    weightKg: num(s.weight_kg),
    reps: num(s.reps),
    distanceM: num(s.distance_meters),
    durationS: num(s.duration_seconds),
    rpe: num(s.rpe),
  };
}

function fromApiWorkout(w: ApiWorkout): HevyWorkout {
  const startedAt = new Date(w.start_time);
  return {
    externalId: minuteId(startedAt),
    name: w.title,
    startedAt,
    finishedAt: new Date(w.end_time),
    notes: w.description || null,
    exercises: w.exercises.map((e) => ({
      title: e.title,
      templateId: e.exercise_template_id,
      notes: e.notes || null,
      sets: e.sets.map(fromApiSet),
    })),
  };
}

function fromApiRoutine(r: ApiRoutine): HevyRoutine {
  return {
    id: r.id,
    name: r.title,
    exercises: r.exercises.map((e) => {
      const working = e.sets.filter((s) => s.type !== 'warmup');
      const first = working[0];
      const range = first?.rep_range;
      const targetReps = range?.start && range?.end ? `${range.start}-${range.end}` : first?.reps ? String(first.reps) : '8-12';
      return {
        title: e.title,
        templateId: e.exercise_template_id,
        targetSets: Math.max(1, working.length),
        targetReps,
        restSeconds: e.rest_seconds ?? 90,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Hevy CSV export (any Hevy user)
// ---------------------------------------------------------------------------

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Hevy writes times like "20 Mar 2024, 18:06" in the phone's local time. */
export function parseHevyDate(value: string): Date | null {
  const v = value.trim();
  let m = v.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase());
    if (month < 0) return null;
    return new Date(Number(m[3]), month, Number(m[1]), hour(Number(m[4]), m[7]), Number(m[5]), Number(m[6] ?? 0));
  }
  m = v.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    if (month < 0) return null;
    return new Date(Number(m[3]), month, Number(m[2]), hour(Number(m[4]), m[7]), Number(m[5]), Number(m[6] ?? 0));
  }
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

function hour(h: number, ampm?: string) {
  if (!ampm) return h;
  const pm = ampm.toLowerCase() === 'pm';
  return (h % 12) + (pm ? 12 : 0);
}

export function parseHevyCsv(text: string): HevyWorkout[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('That file is empty. Export your workouts from Hevy again.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const c = {
    title: col('title'),
    start: col('start_time'),
    end: col('end_time'),
    description: col('description'),
    exercise: col('exercise_title'),
    exerciseNotes: col('exercise_notes'),
    setIndex: col('set_index'),
    setType: col('set_type'),
    kg: col('weight_kg'),
    lbs: col('weight_lbs'),
    reps: col('reps'),
    km: col('distance_km'),
    miles: col('distance_miles'),
    meters: col('distance_meters'),
    seconds: col('duration_seconds'),
    rpe: col('rpe'),
  };
  if (c.title < 0 || c.start < 0 || c.exercise < 0) {
    throw new Error(
      "This doesn't look like a Hevy workouts export. In Hevy, go to Settings → Export & Import Data → Export Data and export your workouts."
    );
  }

  const workouts = new Map<string, HevyWorkout>();
  let lastSetIndex = -1;
  for (const r of rows.slice(1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const startedAt = parseHevyDate(get(c.start));
    const title = get(c.exercise);
    if (!startedAt || !title) continue;
    const key = `${get(c.title)}|${get(c.start)}`;
    let w = workouts.get(key);
    if (!w) {
      w = {
        externalId: minuteId(startedAt),
        name: get(c.title) || 'Workout',
        startedAt,
        finishedAt: parseHevyDate(get(c.end)) ?? startedAt,
        notes: get(c.description) || null,
        exercises: [],
      };
      workouts.set(key, w);
      lastSetIndex = -1;
    }
    const setIndex = Number(get(c.setIndex));
    let ex = w.exercises[w.exercises.length - 1];
    // A new exercise block starts when the title changes or the set numbering restarts.
    if (!ex || ex.title !== title || (Number.isFinite(setIndex) && setIndex <= lastSetIndex)) {
      ex = { title, notes: get(c.exerciseNotes) || null, sets: [] };
      w.exercises.push(ex);
    }
    lastSetIndex = Number.isFinite(setIndex) ? setIndex : lastSetIndex + 1;

    const lbs = num(get(c.lbs));
    const miles = num(get(c.miles));
    const km = num(get(c.km));
    ex.sets.push({
      type: setType(get(c.setType)),
      weightKg: num(get(c.kg)) ?? (lbs != null ? lbs * 0.45359237 : null),
      reps: num(get(c.reps)),
      distanceM: num(get(c.meters)) ?? (km != null ? km * 1000 : miles != null ? miles * 1609.344 : null),
      durationS: num(get(c.seconds)),
      rpe: num(get(c.rpe)),
    });
  }
  if (workouts.size === 0) throw new Error('No workouts found in that file.');
  return [...workouts.values()];
}

// ---------------------------------------------------------------------------
// Matching Hevy exercises to Shredder's library
// ---------------------------------------------------------------------------

/** Hevy names that differ from Shredder's for the same exercise. Keys are normalised. */
/** The library name a Hevy title is known by, when the two differ (e.g. "Butterfly (Pec Deck)" -> "Pec Deck"). */
export const libraryAlias = (title: string): string | undefined => ALIASES[norm(title)];

const ALIASES: Record<string, string> = {
  skullcrusherbarbell: 'Skull Crusher (EZ Bar)',
  skullcrusherezbar: 'Skull Crusher (EZ Bar)',
  preachercurlbarbell: 'Preacher Curl (EZ Bar)',
  cableflycrossovers: 'Cable Crossover',
  seatedcablerowvgripcable: 'Seated Cable Row',
  seatedcablerowbargripcable: 'Seated Cable Row',
  butterflypecdeck: 'Pec Deck',
  dumbbellrow: 'Single Arm Row (Dumbbell)',
  overheadpressdumbbell: 'Shoulder Press (Dumbbell)',
  bicepcurlcable: 'Cable Curl',
  tricepsropepushdown: 'Triceps Pushdown (Rope)',
  treadmill: 'Treadmill Run',
  jumprope: 'Skipping Rope',
  abwheel: 'Ab Wheel Rollout',
  cyclingmachine: 'Cycling (Stationary)',
  shrugbarbell: 'Shrug (Dumbbell)',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
const base = (s: string) => norm(s.replace(/\s*\([^)]*\)\s*$/, ''));
const hasEquipment = (s: string) => /\([^)]*\)\s*$/.test(s);

const MUSCLES: Record<string, string> = {
  abdominals: 'core',
  chest: 'chest',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  quadriceps: 'quads',
  hamstrings: 'hamstrings',
  calves: 'calves',
  glutes: 'glutes',
  abductors: 'glutes',
  adductors: 'quads',
  lats: 'back',
  upper_back: 'back',
  lower_back: 'back',
  traps: 'traps',
  neck: 'traps',
  cardio: 'cardio',
};

function kindFromTemplate(type: string): ExerciseKind | null {
  if (type === 'weight_reps') return 'weight_reps';
  if (['reps_only', 'bodyweight_reps', 'bodyweight_assisted_reps'].includes(type)) return 'bodyweight_reps';
  if (['duration', 'weight_duration'].includes(type)) return 'duration';
  if (['distance_duration', 'short_distance_weight'].includes(type)) return 'distance_time';
  return null;
}

function kindFromSets(sets: HevySet[]): ExerciseKind {
  if (sets.some((s) => (s.weightKg ?? 0) > 0)) return 'weight_reps';
  if (sets.some((s) => (s.distanceM ?? 0) > 0)) return 'distance_time';
  if (sets.some((s) => (s.reps ?? 0) > 0)) return 'bodyweight_reps';
  if (sets.some((s) => (s.durationS ?? 0) > 0)) return 'duration';
  return 'weight_reps';
}

function equipmentFrom(title: string, template?: ApiTemplate): string {
  const e = template?.equipment ?? title.match(/\(([^)]*)\)\s*$/)?.[1]?.toLowerCase() ?? '';
  if (['barbell', 'dumbbell', 'machine', 'cable'].includes(e)) return e;
  if (e === 'none' || e === 'bodyweight') return 'bodyweight';
  return 'other';
}

/**
 * Hevy exercise title -> Shredder exercise id. Uses the library or your existing custom
 * exercises where the names match; creates custom exercises for the rest.
 */
export async function matchExercises(
  userId: string,
  wanted: { title: string; templateId?: string; sets: HevySet[] }[],
  template: ((id: string) => Promise<ApiTemplate>) | null,
  progress: Progress
): Promise<{ ids: Map<string, string>; created: string[] }> {
  // Paged, so the whole library (more than the server's 1,000 rows a request) is matched against.
  const all = await fetchExercises();
  // Your own exercises first, so a previous import's custom exercise is reused.
  const byName = new Map<string, Exercise>();
  for (const e of [...all.filter((e) => e.created_by === null), ...all.filter((e) => e.created_by === userId)]) {
    byName.set(norm(e.name), e);
  }
  const library = all.filter((e) => e.created_by === null);

  const ids = new Map<string, string>();
  const created: string[] = [];
  const unmatched = new Map<string, { templateId?: string; sets: HevySet[] }>();

  for (const w of wanted) {
    if (ids.has(w.title)) continue;
    const key = norm(w.title);
    const exact = byName.get(key) ?? (ALIASES[key] ? byName.get(norm(ALIASES[key])) : undefined);
    // "Leg Press (Machine)" -> "Leg Press": only when one side names no equipment, so
    // "Bench Press (Dumbbell)" never becomes "Bench Press (Barbell)".
    const loose =
      exact ??
      library.find((e) => base(e.name) === base(w.title) && (!hasEquipment(e.name) || !hasEquipment(w.title))) ??
      // The same exercise spelled another way ("Bicep Curl" / "Biceps Curl", "Pull Up" / "Pull-Up").
      (() => {
        const m = bestMatch(w.title, undefined, library);
        return m?.exact ? m.match : undefined;
      })();
    if (loose) {
      ids.set(w.title, loose.id);
    } else {
      const u = unmatched.get(w.title) ?? { templateId: w.templateId, sets: [] };
      u.sets.push(...w.sets);
      unmatched.set(w.title, u);
    }
  }

  let n = 0;
  for (const [title, u] of unmatched) {
    n++;
    progress(`Adding exercises Shredder doesn't have… ${n} of ${unmatched.size}`);
    let t: ApiTemplate | undefined;
    if (template && u.templateId) t = await template(u.templateId).catch(() => undefined);
    const { data: row, error: insertError } = await supabase
      .from('exercises')
      .insert({
        name: title,
        primary_muscle: (t && MUSCLES[t.primary_muscle_group]) || 'other',
        equipment: equipmentFrom(title, t),
        kind: (t && kindFromTemplate(t.type)) || kindFromSets(u.sets),
        created_by: userId,
      })
      .select('id')
      .single();
    if (insertError) throw insertError;
    ids.set(title, row.id as string);
    created.push(title);
  }
  return { ids, created };
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export async function importHevy(
  userId: string,
  source: { workouts: HevyWorkout[]; routines?: HevyRoutine[]; template?: (id: string) => Promise<ApiTemplate> },
  progress: Progress
): Promise<ImportResult> {
  const routines = source.routines ?? [];
  const wanted = [
    ...source.workouts.flatMap((w) => w.exercises),
    ...routines.flatMap((r) => r.exercises.map((e) => ({ ...e, sets: [] as HevySet[] }))),
  ];
  const { ids, created } = await matchExercises(userId, wanted, source.template ?? null, progress);

  const ordered = [...source.workouts].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < ordered.length; i += BATCH) {
    progress(`Saving workouts… ${Math.min(i + BATCH, ordered.length)} of ${ordered.length}`);
    const batch = ordered.slice(i, i + BATCH).map((w) => ({
      external_id: w.externalId,
      name: w.name,
      day: toDay(w.startedAt),
      started_at: w.startedAt.toISOString(),
      finished_at: w.finishedAt.toISOString(),
      notes: w.notes,
      exercises: w.exercises
        .filter((e) => e.sets.length > 0)
        .map((e) => ({
          exercise_id: ids.get(e.title),
          notes: e.notes,
          sets: e.sets.map((s) => ({
            set_type: s.type,
            weight_kg: s.weightKg != null && s.weightKg > 0 ? Math.round(s.weightKg * 100) / 100 : null,
            reps: s.reps != null ? Math.round(s.reps) : null,
            duration_s: s.durationS != null ? Math.round(s.durationS) : null,
            distance_m: s.distanceM != null ? Math.round(s.distanceM * 10) / 10 : null,
            rpe: s.rpe != null && s.rpe >= 1 && s.rpe <= 10 ? s.rpe : null,
          })),
        })),
    }));
    const { data, error } = await supabase.rpc('import_workouts', { p: { source: 'hevy', workouts: batch } });
    if (error) throw error;
    imported += (data as { imported: number }).imported;
    skipped += (data as { skipped: number }).skipped;
  }

  let routineCount = 0;
  if (routines.length) {
    progress('Saving routines…');
    const { data: existing } = await supabase.from('routines').select('external_id').eq('source', 'hevy');
    const have = new Set((existing ?? []).map((r) => r.external_id as string));
    for (const r of routines) {
      if (have.has(r.id) || r.exercises.length === 0) continue;
      const { data: row, error } = await supabase
        .from('routines')
        .insert({ name: r.name, source: 'hevy', external_id: r.id })
        .select('id')
        .single();
      if (error) throw error;
      const { error: exError } = await supabase.from('routine_exercises').insert(
        r.exercises.map((e, i) => ({
          routine_id: row.id,
          exercise_id: ids.get(e.title),
          position: i + 1,
          target_sets: e.targetSets,
          target_reps: e.targetReps,
          rest_seconds: e.restSeconds,
        }))
      );
      if (exError) throw exError;
      routineCount++;
    }
  }
  return { imported, skipped, routines: routineCount, newExercises: created };
}

// ---------------------------------------------------------------------------

function setType(t: string): HevySet['type'] {
  const v = t.trim().toLowerCase();
  if (v === 'warmup' || v === 'warm_up') return 'warmup';
  if (v === 'dropset' || v === 'drop') return 'drop';
  if (v === 'failure') return 'failure';
  return 'normal';
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function minuteId(d: Date): string {
  return d.toISOString().slice(0, 16) + 'Z';
}
