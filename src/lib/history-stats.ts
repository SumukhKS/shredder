import { fromKg, type WeightUnit } from '@/lib/units';
import type { ExerciseKind } from '@/types/db';

/** One logged set, as the history and charts read it. */
export interface HistorySet {
  set_type: string;
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  is_pr?: boolean;
}

/** One session of an exercise: the workout it was in and the sets done. */
export interface ExerciseSession {
  workoutId: string;
  workoutName: string;
  day: string;
  startedAt: string;
  sets: HistorySet[];
}

export type Metric = 'heaviest' | 'e1rm' | 'volume' | 'reps' | 'totalReps' | 'duration' | 'distance';

export const METRIC_LABELS: Record<Metric, string> = {
  heaviest: 'Heaviest',
  e1rm: 'Est. 1RM',
  volume: 'Volume',
  reps: 'Most reps',
  totalReps: 'Total reps',
  duration: 'Longest',
  distance: 'Distance',
};

/** Metrics measured in weight: stored in kg, shown in the chosen unit. */
const WEIGHT_METRICS = new Set<Metric>(['heaviest', 'e1rm', 'volume']);

/** The unit after a metric's number (with its leading space), e.g. " kg", " lb", " km", or "". */
export function metricUnit(metric: Metric, u: WeightUnit): string {
  if (WEIGHT_METRICS.has(metric)) return ` ${u}`;
  return metric === 'duration' ? ' s' : metric === 'distance' ? ' km' : '';
}

/** A stored metric value in the display unit (only weights change). */
export function metricInUnit(metric: Metric, v: number, u: WeightUnit): number {
  return WEIGHT_METRICS.has(metric) ? fromKg(v, u) : v;
}

/** The progress lines worth charting for each kind of exercise, the main one first. */
export function metricsFor(kind: ExerciseKind): Metric[] {
  switch (kind) {
    case 'weight_reps':
      return ['heaviest', 'e1rm', 'volume'];
    case 'bodyweight_reps':
      return ['reps', 'totalReps'];
    case 'duration':
      return ['duration'];
    case 'distance_time':
      return ['distance', 'duration'];
  }
}

const num = (v: number | null | undefined) => Number(v ?? 0);

/** A session's value for one metric, from its working sets (warm-ups don't count). Null when nothing counts. */
export function sessionValue(metric: Metric, sets: HistorySet[]): number | null {
  const work = sets.filter((s) => s.set_type !== 'warmup');
  if (!work.length) return null;
  const best = (f: (s: HistorySet) => number) => Math.max(...work.map(f));
  let v: number;
  switch (metric) {
    case 'heaviest':
      v = best((s) => num(s.weight_kg));
      break;
    case 'e1rm':
      // Epley, trusted for 1-12 reps (matches the server and the records list).
      v = best((s) =>
        num(s.weight_kg) > 0 && num(s.reps) >= 1 && num(s.reps) <= 12 ? num(s.weight_kg) * (1 + num(s.reps) / 30) : 0
      );
      v = Math.round(v * 10) / 10;
      break;
    case 'volume':
      v = work.reduce((t, s) => t + num(s.weight_kg) * num(s.reps), 0);
      break;
    case 'reps':
      v = best((s) => num(s.reps));
      break;
    case 'totalReps':
      v = work.reduce((t, s) => t + num(s.reps), 0);
      break;
    case 'duration':
      v = best((s) => num(s.duration_s));
      break;
    case 'distance':
      v = best((s) => num(s.distance_m)) / 1000;
      break;
  }
  return v > 0 ? v : null;
}

/** Points for a chart, oldest first, with the sessions that set a record flagged. */
export function chartSeries(metric: Metric, sessions: ExerciseSession[]) {
  return [...sessions]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((s) => ({ day: s.day, value: sessionValue(metric, s.sets), pr: s.sets.some((x) => x.is_pr) }))
    .filter((p): p is { day: string; value: number; pr: boolean } => p.value != null);
}

/** All-time bests for the records strip: the best session for each metric. */
export function allTimeBests(kind: ExerciseKind, sessions: ExerciseSession[]): { metric: Metric; value: number }[] {
  return metricsFor(kind)
    .map((metric) => ({ metric, value: Math.max(0, ...sessions.map((s) => sessionValue(metric, s.sets) ?? 0)) }))
    .filter((b) => b.value > 0);
}

/** A metric's value in words: full numbers, never shortened. `v` is as stored (kg for weights). */
export function formatMetric(metric: Metric, stored: number, u: WeightUnit): string {
  const v = metricInUnit(metric, stored, u);
  if (metric === 'duration') {
    const m = Math.floor(v / 60);
    const sec = Math.round(v % 60);
    return m ? `${m}:${String(sec).padStart(2, '0')} min` : `${sec} s`;
  }
  const rounded = metric === 'distance' ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10;
  return `${rounded.toLocaleString()}${metricUnit(metric, u)}`;
}
