import 'expo-sqlite/localStorage/install';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { toDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { fetchPreviousSets, type PreviousSet } from '@/lib/workouts';
import type { Exercise, ExerciseKind, FinishWorkoutResult, Routine, SetType } from '@/types/db';

export interface ActiveSet {
  key: string;
  setType: SetType;
  weight: string;
  reps: string;
  duration: string; // seconds
  distance: string; // metres
  done: boolean;
}

export interface ActiveExercise {
  key: string;
  exercise: Exercise;
  restSeconds: number;
  notes: string;
  sets: ActiveSet[];
  previous: PreviousSet[];
}

export interface ActiveWorkout {
  name: string;
  routineId: string | null;
  startedAt: string;
  exercises: ActiveExercise[];
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
  rename: (name: string) => void;
  addExercises: (exercises: Exercise[]) => Promise<void>;
  removeExercise: (exKey: string) => void;
  moveExercise: (exKey: string, dir: -1 | 1) => void;
  setNotes: (exKey: string, notes: string) => void;
  addSet: (exKey: string) => void;
  removeSet: (exKey: string, setKey: string) => void;
  updateSet: (exKey: string, setKey: string, patch: Partial<ActiveSet>) => void;
  cycleSetType: (exKey: string, setKey: string) => void;
  toggleDone: (exKey: string, setKey: string) => boolean;
  setRestSeconds: (exKey: string, seconds: number) => void;
  adjustRest: (deltaSeconds: number) => void;
  skipRest: () => void;
  discard: () => void;
  finish: () => Promise<FinishWorkoutResult>;
}

let counter = 0;
const uid = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

function emptySet(kind: ExerciseKind, prev?: PreviousSet, last?: ActiveSet): ActiveSet {
  const cardio = kind === 'distance_time';
  const fmt = (v: number | null | undefined, div = 1) => (v != null ? String(Math.round((Number(v) / div) * 100) / 100) : '');
  return {
    key: uid(),
    setType: 'normal',
    weight: last?.weight ?? fmt(prev?.weight_kg),
    reps: last?.reps ?? fmt(prev?.reps),
    duration: last?.duration ?? fmt(prev?.duration_s, cardio ? 60 : 1),
    distance: last?.distance ?? fmt(prev?.distance_m, cardio ? 1000 : 1),
    done: false,
  };
}

function buildExercise(exercise: Exercise, previous: PreviousSet[], setCount: number, restSeconds = 90): ActiveExercise {
  const count = Math.max(1, setCount || previous.length || 3);
  return {
    key: uid(),
    exercise,
    restSeconds,
    notes: '',
    previous,
    sets: Array.from({ length: count }, (_, i) => emptySet(exercise.kind, previous[i] ?? previous[previous.length - 1])),
  };
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
          set({ active: { name, routineId: routine?.id ?? null, startedAt: now.toISOString(), exercises: [] }, rest: null });
          if (routine?.routine_exercises.length) {
            const ids = routine.routine_exercises.map((r) => r.exercise_id);
            const prev = await fetchPreviousSets(ids).catch(() => ({}) as Record<string, PreviousSet[]>);
            set((s) =>
              s.active
                ? {
                    active: {
                      ...s.active,
                      exercises: routine.routine_exercises.map((r) =>
                        buildExercise(r.exercises, prev[r.exercise_id] ?? [], r.target_sets, r.rest_seconds)
                      ),
                    },
                  }
                : s
            );
          }
        },

        rename: (name) => set((s) => (s.active ? { active: { ...s.active, name } } : s)),

        addExercises: async (exercises) => {
          const prev = await fetchPreviousSets(exercises.map((e) => e.id)).catch(
            () => ({}) as Record<string, PreviousSet[]>
          );
          set((s) =>
            s.active
              ? {
                  active: {
                    ...s.active,
                    exercises: [...s.active.exercises, ...exercises.map((e) => buildExercise(e, prev[e.id] ?? [], 0))],
                  },
                }
              : s
          );
        },

        removeExercise: (exKey) =>
          set((s) => (s.active ? { active: { ...s.active, exercises: s.active.exercises.filter((e) => e.key !== exKey) } } : s)),

        moveExercise: (exKey, dir) =>
          set((s) => {
            if (!s.active) return s;
            const list = [...s.active.exercises];
            const i = list.findIndex((e) => e.key === exKey);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= list.length) return s;
            [list[i], list[j]] = [list[j], list[i]];
            return { active: { ...s.active, exercises: list } };
          }),

        setNotes: (exKey, notes) => mapExercise(exKey, (e) => ({ ...e, notes })),

        addSet: (exKey) =>
          mapExercise(exKey, (e) => ({
            ...e,
            sets: [...e.sets, emptySet(e.exercise.kind, e.previous[e.sets.length], e.sets[e.sets.length - 1])],
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

        /** Returns true when the set was marked done (so the UI can celebrate). */
        toggleDone: (exKey, setKey) => {
          const ex = get().active?.exercises.find((e) => e.key === exKey);
          const target = ex?.sets.find((x) => x.key === setKey);
          if (!ex || !target) return false;
          const nowDone = !target.done;
          if (nowDone && !setIsValid(ex, target)) return false;
          mapExercise(exKey, (e) => ({ ...e, sets: e.sets.map((x) => (x.key === setKey ? { ...x, done: nowDone } : x)) }));
          if (nowDone && ex.restSeconds > 0 && target.setType !== 'warmup') {
            set({ rest: { endsAt: Date.now() + ex.restSeconds * 1000, duration: ex.restSeconds, exerciseName: ex.exercise.name } });
          }
          return nowDone;
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
                    weight_kg: n(s.weight),
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

export function liveVolume(active: ActiveWorkout | null) {
  if (!active) return 0;
  return active.exercises.reduce(
    (v, e) =>
      v + e.sets.filter((s) => s.done && s.setType !== 'warmup').reduce((a, s) => a + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0),
    0
  );
}
