import 'expo-sqlite/localStorage/install';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { toDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { currentUnits, fromKg, toKg, type WeightUnit } from '@/lib/units';
import { beatsAll, e1rm, fetchBests, fetchPreviousSets, type ExerciseBest, type PreviousSet } from '@/lib/workouts';
import type { Exercise, ExerciseKind, FinishWorkoutResult, Routine, SetType } from '@/types/db';

export interface ActiveSet {
  key: string;
  setType: SetType;
  weight: string;
  reps: string;
  duration: string; // seconds
  distance: string; // metres
  done: boolean;
  /** Ticked as a personal record, so the row keeps its medal. */
  pr?: boolean;
}

export interface ActiveExercise {
  key: string;
  exercise: Exercise;
  restSeconds: number;
  notes: string;
  sets: ActiveSet[];
  previous: PreviousSet[];
  /** Best before this workout; missing the first time an exercise is done. */
  best?: ExerciseBest | null;
}

/** A personal record hit on a ticked set, for the medal animation. */
export interface PrHit {
  exerciseName: string;
  /** kg */
  weight: number;
  reps: number;
  /** New heaviest working weight. */
  heaviest: boolean;
  /** New best estimated one-rep max (set when it beat the old one). */
  e1rm: number | null;
  /** No weight on the set (bodyweight moves), so it's described by reps alone. */
  bodyweight: boolean;
}

export interface ActiveWorkout {
  name: string;
  routineId: string | null;
  startedAt: string;
  exercises: ActiveExercise[];
  /** The unit weights are typed in, fixed when the workout starts (older saved workouts: kg). */
  unit?: WeightUnit;
}

interface RestTimer {
  endsAt: number;
  duration: number;
  exerciseName: string;
}

interface WorkoutState {
  active: ActiveWorkout | null;
  rest: RestTimer | null;
  start: (routine?: Routine) => Promise<void>;
  startWith: (name: string, exercises: { exercise: Exercise; sets: number }[]) => Promise<void>;
  rename: (name: string) => void;
  addExercises: (exercises: Exercise[]) => Promise<void>;
  removeExercise: (exKey: string) => void;
  /** Puts the exercises in this order (keys from a drag-and-drop list). */
  reorderExercises: (keys: string[]) => void;
  setNotes: (exKey: string, notes: string) => void;
  addSet: (exKey: string) => void;
  removeSet: (exKey: string, setKey: string) => void;
  updateSet: (exKey: string, setKey: string, patch: Partial<ActiveSet>) => void;
  cycleSetType: (exKey: string, setKey: string) => void;
  toggleDone: (exKey: string, setKey: string) => { done: boolean; pr: PrHit | null };
  setRestSeconds: (exKey: string, seconds: number) => void;
  adjustRest: (deltaSeconds: number) => void;
  skipRest: () => void;
  discard: () => void;
  finish: () => Promise<FinishWorkoutResult>;
}

let counter = 0;
const uid = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

export type SetField = 'weight' | 'reps' | 'duration' | 'distance';
const FIELDS: SetField[] = ['weight', 'reps', 'duration', 'distance'];

// Sets start blank; the grey placeholder shows what ticking the set will log.
function emptySet(): ActiveSet {
  return { key: uid(), setType: 'normal', weight: '', reps: '', duration: '', distance: '', done: false };
}

function fromPrevious(kind: ExerciseKind, prev: PreviousSet | undefined, field: SetField, unit: WeightUnit): string {
  if (!prev) return '';
  const cardio = kind === 'distance_time';
  const v = { weight: prev.weight_kg, reps: prev.reps, duration: prev.duration_s, distance: prev.distance_m }[field];
  if (v == null) return '';
  if (field === 'weight') return String(Math.round(fromKg(Number(v), unit) * 10) / 10);
  const div = field === 'duration' && cardio ? 60 : field === 'distance' && cardio ? 1000 : 1;
  return String(Math.round((Number(v) / div) * 100) / 100);
}

/**
 * The value a blank field stands for: whatever the set above logged (or would log),
 * and for the first set, the first set from last time.
 */
export function placeholderFor(ex: ActiveExercise, index: number, field: SetField, unit: WeightUnit): string {
  for (let i = index - 1; i >= 0; i--) {
    const v = ex.sets[i][field];
    if (v !== '') return v;
  }
  return fromPrevious(ex.exercise.kind, ex.previous[0], field, unit);
}

function filled(ex: ActiveExercise, index: number, unit: WeightUnit): ActiveSet {
  const s = { ...ex.sets[index] };
  for (const f of FIELDS) if (s[f] === '') s[f] = placeholderFor(ex, index, f, unit);
  return s;
}

const num = (v: string) => Number(v.replace(',', '.')) || 0;

/** Did this set beat everything before it, including earlier sets today? */
// The first workout with an exercise is a baseline: with no past history there is nothing to beat.
function detectPr(ex: ActiveExercise, index: number, set: ActiveSet, unit: WeightUnit): PrHit | null {
  const kind = ex.exercise.kind;
  const history = ex.best?.history ?? [];
  if ((kind !== 'weight_reps' && kind !== 'bodyweight_reps') || set.setType === 'warmup' || !ex.best || !history.length) {
    return null;
  }
  // History and bests are in kg; typed weights are converted (and rounded like the database keeps them).
  const kg = (v: string) => Math.round(toKg(num(v), unit) * 100) / 100;
  const weight = kg(set.weight);
  const reps = num(set.reps);
  const earlier = [...history];
  let bestWeight = ex.best.weight;
  let bestE1rm = ex.best.e1rm;
  ex.sets.forEach((x, i) => {
    if (i === index || !x.done || x.setType === 'warmup') return;
    earlier.push({ weight: kg(x.weight), reps: num(x.reps) });
    bestWeight = Math.max(bestWeight, kg(x.weight));
    bestE1rm = Math.max(bestE1rm, e1rm(kg(x.weight), num(x.reps)) ?? 0);
  });
  if (!beatsAll(weight, reps, earlier)) return null;
  const est = e1rm(weight, reps);
  return {
    exerciseName: ex.exercise.name,
    weight,
    reps,
    heaviest: weight > bestWeight,
    e1rm: est != null && est > bestE1rm ? est : null,
    bodyweight: weight === 0,
  };
}

function buildExercise(
  exercise: Exercise,
  previous: PreviousSet[],
  best: ExerciseBest | undefined,
  setCount: number,
  restSeconds = 90
): ActiveExercise {
  const count = Math.max(1, setCount || previous.length || 3);
  return {
    key: uid(),
    exercise,
    restSeconds,
    notes: '',
    previous,
    best: best ?? null,
    sets: Array.from({ length: count }, emptySet),
  };
}

async function history(ids: string[]) {
  const [prev, bests] = await Promise.all([
    fetchPreviousSets(ids).catch(() => ({}) as Record<string, PreviousSet[]>),
    fetchBests(ids).catch(() => ({}) as Record<string, ExerciseBest>),
  ]);
  return { prev, bests };
}

const SET_CYCLE: SetType[] = ['normal', 'warmup', 'drop', 'failure'];

function setIsValid(ex: ActiveExercise, s: ActiveSet) {
  switch (ex.exercise.kind) {
    case 'weight_reps':
      return Number(s.reps) > 0;
    case 'bodyweight_reps':
      return Number(s.reps) > 0;
    case 'duration':
      return Number(s.duration) > 0;
    case 'distance_time':
      return Number(s.duration) > 0 || Number(s.distance) > 0;
  }
}

export const useWorkout = create<WorkoutState>()(
  persist(
    (set, get) => {
      const mapExercise = (exKey: string, fn: (ex: ActiveExercise) => ActiveExercise) =>
        set((s) =>
          s.active
            ? { active: { ...s.active, exercises: s.active.exercises.map((e) => (e.key === exKey ? fn(e) : e)) } }
            : s
        );

      return {
        active: null,
        rest: null,

        start: async (routine) => {
          const now = new Date();
          const name = routine?.name ?? `${now.toLocaleDateString(undefined, { weekday: 'long' })} workout`;
          set({
            active: { name, routineId: routine?.id ?? null, startedAt: now.toISOString(), exercises: [], unit: currentUnits().weight },
            rest: null,
          });
          if (routine?.routine_exercises.length) {
            const { prev, bests } = await history(routine.routine_exercises.map((r) => r.exercise_id));
            set((s) =>
              s.active
                ? {
                    active: {
                      ...s.active,
                      exercises: routine.routine_exercises.map((r) =>
                        buildExercise(r.exercises, prev[r.exercise_id] ?? [], bests[r.exercise_id], r.target_sets, r.rest_seconds)
                      ),
                    },
                  }
                : s
            );
          }
        },

        startWith: async (name, exercises) => {
          set({
            active: { name, routineId: null, startedAt: new Date().toISOString(), exercises: [], unit: currentUnits().weight },
            rest: null,
          });
          const { prev, bests } = await history(exercises.map((e) => e.exercise.id));
          set((s) =>
            s.active
              ? {
                  active: {
                    ...s.active,
                    exercises: exercises.map((e) =>
                      buildExercise(e.exercise, prev[e.exercise.id] ?? [], bests[e.exercise.id], e.sets)
                    ),
                  },
                }
              : s
          );
        },

        rename: (name) => set((s) => (s.active ? { active: { ...s.active, name } } : s)),

        addExercises: async (exercises) => {
          const { prev, bests } = await history(exercises.map((e) => e.id));
          set((s) =>
            s.active
              ? {
                  active: {
                    ...s.active,
                    exercises: [...s.active.exercises, ...exercises.map((e) => buildExercise(e, prev[e.id] ?? [], bests[e.id], 0))],
                  },
                }
              : s
          );
        },

        removeExercise: (exKey) =>
          set((s) => (s.active ? { active: { ...s.active, exercises: s.active.exercises.filter((e) => e.key !== exKey) } } : s)),

        reorderExercises: (keys) =>
          set((s) => {
            if (!s.active) return s;
            const list = s.active.exercises;
            const sorted = keys.map((k) => list.find((e) => e.key === k)).filter((e): e is ActiveExercise => !!e);
            return { active: { ...s.active, exercises: [...sorted, ...list.filter((e) => !keys.includes(e.key))] } };
          }),

        setNotes: (exKey, notes) => mapExercise(exKey, (e) => ({ ...e, notes })),

        addSet: (exKey) =>
          mapExercise(exKey, (e) => ({
            ...e,
            sets: [...e.sets, emptySet()],
          })),

        removeSet: (exKey, setKey) => mapExercise(exKey, (e) => ({ ...e, sets: e.sets.filter((x) => x.key !== setKey) })),

        updateSet: (exKey, setKey, patch) =>
          mapExercise(exKey, (e) => ({ ...e, sets: e.sets.map((x) => (x.key === setKey ? { ...x, ...patch } : x)) })),

        cycleSetType: (exKey, setKey) =>
          mapExercise(exKey, (e) => ({
            ...e,
            sets: e.sets.map((x) =>
              x.key === setKey ? { ...x, setType: SET_CYCLE[(SET_CYCLE.indexOf(x.setType) + 1) % SET_CYCLE.length] } : x
            ),
          })),

        /**
         * Ticking a set fills its blank fields from the placeholders. Returns whether it is now
         * done, and the PR it set, if any (so the UI can celebrate).
         */
        toggleDone: (exKey, setKey) => {
          const unit = get().active?.unit ?? 'kg';
          const ex = get().active?.exercises.find((e) => e.key === exKey);
          const index = ex ? ex.sets.findIndex((x) => x.key === setKey) : -1;
          if (!ex || index < 0) return { done: false, pr: null };
          const target = ex.sets[index];
          if (target.done) {
            mapExercise(exKey, (e) => ({ ...e, sets: e.sets.map((x) => (x.key === setKey ? { ...x, done: false, pr: false } : x)) }));
            return { done: false, pr: null };
          }
          const next = { ...filled(ex, index, unit), done: true };
          if (!setIsValid(ex, next)) return { done: false, pr: null };
          const pr = detectPr(ex, index, next, unit);
          next.pr = !!pr;
          mapExercise(exKey, (e) => ({ ...e, sets: e.sets.map((x) => (x.key === setKey ? next : x)) }));
          if (ex.restSeconds > 0 && target.setType !== 'warmup') {
            set({ rest: { endsAt: Date.now() + ex.restSeconds * 1000, duration: ex.restSeconds, exerciseName: ex.exercise.name } });
          }
          return { done: true, pr };
        },

        setRestSeconds: (exKey, seconds) => mapExercise(exKey, (e) => ({ ...e, restSeconds: seconds })),

        adjustRest: (delta) =>
          set((s) =>
            s.rest
              ? { rest: { ...s.rest, endsAt: Math.max(Date.now(), s.rest.endsAt + delta * 1000), duration: Math.max(0, s.rest.duration + delta) } }
              : s
          ),

        skipRest: () => set({ rest: null }),

        discard: () => set({ active: null, rest: null }),

        finish: async () => {
          const active = get().active;
          if (!active) throw new Error('No active workout');
          const unit = active.unit ?? 'kg';

          const exercises = active.exercises
            .map((ex) => ({
              exercise_id: ex.exercise.id,
              notes: ex.notes.trim() || null,
              sets: ex.sets
                .filter((s) => s.done)
                .map((s) => {
                  // Cardio is entered as km and minutes; everything is stored as metres and seconds.
                  const cardio = ex.exercise.kind === 'distance_time';
                  const n = (v: string, mult = 1) => (v === '' ? null : Math.round(Number(v.replace(',', '.')) * mult * 100) / 100);
                  return {
                    set_type: s.setType,
                    weight_kg: s.weight === '' ? null : Math.round(toKg(num(s.weight), unit) * 100) / 100,
                    reps: n(s.reps),
                    duration_s: n(s.duration, cardio ? 60 : 1),
                    distance_m: n(s.distance, cardio ? 1000 : 1),
                  };
                }),
            }))
            .filter((ex) => ex.sets.length > 0);

          if (exercises.length === 0) throw new Error('Complete at least one set before finishing.');

          const finishedAt = new Date();
          const { data, error } = await supabase.rpc('finish_workout', {
            p: {
              name: active.name,
              routine_id: active.routineId,
              day: toDay(new Date(active.startedAt)),
              started_at: active.startedAt,
              finished_at: finishedAt.toISOString(),
              exercises,
            },
          });
          // On failure the workout stays on the device so nothing is lost; the user can retry.
          if (error) throw new Error(error.message);
          set({ active: null, rest: null });
          return data as FinishWorkoutResult;
        },
      };
    },
    {
      name: 'shredder-active-workout',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ active: s.active, rest: s.rest }),
    }
  )
);

export function completedSetCount(active: ActiveWorkout | null) {
  if (!active) return 0;
  return active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
}

/** Volume lifted so far, in kg. */
export function liveVolume(active: ActiveWorkout | null) {
  if (!active) return 0;
  const unit = active.unit ?? 'kg';
  return active.exercises.reduce(
    (v, e) =>
      v +
      e.sets
        .filter((s) => s.done && s.setType !== 'warmup')
        .reduce((a, s) => a + toKg(Number(s.weight) || 0, unit) * (Number(s.reps) || 0), 0),
    0
  );
}
