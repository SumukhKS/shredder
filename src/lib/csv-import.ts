// Reading any app's CSV by matching its columns, with no React Native imports so tests can run it directly.
import type { HevySet, HevyWorkout } from './hevy';
import { parseAmount } from './validate';

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

/**
 * A date, with its time if it has one. Reads 2026-10-30, 30/10/2026, 30 Oct 2026 and Oct 30, 2026.
 * 03/04/2026 could be either way round: it's read day first unless only the other order can be valid,
 * and the preview shows the result before anything is saved.
 */
export function parseCsvDate(value: string): Date | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  let rest = '';
  let hit: RegExpMatchArray | null;
  if ((hit = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/))) {
    [y, m, d, rest] = [+hit[1], +hit[2], +hit[3], hit[4]];
  } else if ((hit = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(.*)$/))) {
    const [a, b] = [+hit[1], +hit[2]];
    [d, m] = b > 12 ? [b, a] : [a, b];
    [y, rest] = [+hit[3], hit[4]];
  } else if ((hit = v.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})(.*)$/i))) {
    [d, m, y, rest] = [+hit[1], MONTHS.indexOf(hit[2].toLowerCase()) + 1, +hit[3], hit[4]];
  } else if ((hit = v.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})(.*)$/i))) {
    [m, d, y, rest] = [MONTHS.indexOf(hit[1].toLowerCase()) + 1, +hit[2], +hit[3], hit[4]];
  } else {
    return null;
  }
  const time = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hour = time ? +time[1] : 12;
  if (time?.[4]) hour = (hour % 12) + (time[4].toLowerCase() === 'pm' ? 12 : 0);
  const date = new Date(y, m - 1, d, hour, time ? +time[2] : 0, time?.[3] ? +time[3] : 0);
  // new Date rolls 31 Feb over into March, so check it stayed on the date asked for.
  return m >= 1 && date.getMonth() === m - 1 && date.getDate() === d && y > 1900 ? date : null;
}

const dayOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export interface CsvField {
  key: string;
  label: string;
  required?: boolean;
  /** Words that identify this column in a header. */
  names: string[];
}

/** Field key -> column number. A field with no column is left out. */
export type ColumnMap = Record<string, number | undefined>;

const simple = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** A first guess at which column is which: an exact header wins, then one containing the name. Each column is used once. */
export function guessColumns(header: string[], fields: CsvField[]): ColumnMap {
  const cols = header.map(simple);
  const used = new Set<number>();
  const map: ColumnMap = {};
  const take = (test: (col: string, name: string) => boolean) => {
    for (const f of fields) {
      if (map[f.key] != null) continue;
      for (const name of f.names) {
        const i = cols.findIndex((col, n) => !used.has(n) && test(col, name));
        if (i >= 0) {
          map[f.key] = i;
          used.add(i);
          break;
        }
      }
    }
  };
  take((col, name) => col === name);
  take((col, name) => ` ${col} `.includes(` ${name} `));
  return map;
}

export const MEASUREMENT_FIELDS: CsvField[] = [
  { key: 'day', label: 'Date', required: true, names: ['date', 'day', 'time'] },
  { key: 'weight_kg', label: 'Body weight', names: ['weight', 'body weight', 'bodyweight'] },
  { key: 'body_fat_pct', label: 'Body fat', names: ['body fat', 'bodyfat', 'fat', 'bf'] },
  { key: 'neck_cm', label: 'Neck', names: ['neck'] },
  { key: 'shoulders_cm', label: 'Shoulders', names: ['shoulders', 'shoulder'] },
  { key: 'chest_cm', label: 'Chest', names: ['chest'] },
  { key: 'waist_cm', label: 'Waist', names: ['waist'] },
  { key: 'hips_cm', label: 'Hips', names: ['hips', 'hip'] },
  { key: 'arm_cm', label: 'Arm', names: ['arm', 'biceps', 'bicep', 'arms'] },
  { key: 'forearm_cm', label: 'Forearm', names: ['forearm', 'forearms'] },
  { key: 'thigh_cm', label: 'Thigh', names: ['thigh', 'thighs'] },
  { key: 'calf_cm', label: 'Calf', names: ['calf', 'calves'] },
];

export interface MeasurementRow {
  day: string;
  values: Record<string, number>;
}

/**
 * One row per day with only the cells that hold a believable number, so an empty cell can't erase what's
 * already saved. Cells that can't be right are counted rather than saved.
 */
export function buildMeasurements(rows: string[][], map: ColumnMap, units: { weightFactor: number; lengthFactor: number }) {
  const days = new Map<string, MeasurementRow>();
  let badDates = 0;
  let badCells = 0;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  for (const r of rows) {
    const date = map.day != null ? parseCsvDate(r[map.day] ?? '') : null;
    if (!date) {
      badDates++;
      continue;
    }
    const day = dayOf(date);
    const row = days.get(day) ?? { day, values: {} };
    for (const f of MEASUREMENT_FIELDS) {
      const col = map[f.key];
      if (f.key === 'day' || col == null || !(r[col] ?? '').trim()) continue;
      const typed = parseAmount(r[col]);
      const isWeight = f.key === 'weight_kg';
      const isFat = f.key === 'body_fat_pct';
      const v = typed == null ? null : round1(typed * (isWeight ? units.weightFactor : isFat ? 1 : units.lengthFactor));
      const [lo, hi] = isWeight ? [30, 300] : isFat ? [2, 70] : [10, 250];
      if (v == null || v < lo || v > hi) badCells++;
      else row.values[f.key] = v;
    }
    if (Object.keys(row.values).length) days.set(day, row);
  }
  return { rows: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)), badDates, badCells };
}

export const WORKOUT_FIELDS: CsvField[] = [
  { key: 'date', label: 'Date', required: true, names: ['date', 'start time', 'day', 'time', 'started'] },
  {
    key: 'exercise',
    label: 'Exercise',
    required: true,
    names: ['exercise', 'exercise name', 'exercise title', 'movement', 'lift'],
  },
  { key: 'name', label: 'Workout name', names: ['workout name', 'workout', 'title', 'routine', 'session'] },
  { key: 'weight', label: 'Weight', names: ['weight', 'load', 'kg', 'lbs', 'lb'] },
  { key: 'reps', label: 'Reps', names: ['reps', 'repetitions', 'rep'] },
  { key: 'seconds', label: 'Set time (seconds)', names: ['seconds', 'duration', 'time seconds'] },
  { key: 'distance', label: 'Distance', names: ['distance', 'meters', 'metres'] },
];

/** Workouts from a set-by-set file: one row per set, grouped by date and workout name. */
export function buildWorkouts(rows: string[][], map: ColumnMap, units: { weightFactor: number; metresPerUnit: number }) {
  const workouts = new Map<string, HevyWorkout>();
  let skipped = 0;
  const amount = (r: string[], key: string) => {
    const col = map[key];
    return col == null ? null : parseAmount(r[col] ?? '');
  };
  for (const r of rows) {
    const date = map.date != null ? parseCsvDate(r[map.date] ?? '') : null;
    const title = map.exercise != null ? (r[map.exercise] ?? '').trim() : '';
    if (!date || !title) {
      skipped++;
      continue;
    }
    const name = (map.name != null ? (r[map.name] ?? '').trim() : '') || 'Workout';
    const id = `csv:${date.toISOString().slice(0, 16)}:${name}`;
    let w = workouts.get(id);
    if (!w) {
      w = { externalId: id, name, startedAt: date, finishedAt: date, notes: null, exercises: [] };
      workouts.set(id, w);
    }
    let ex = w.exercises[w.exercises.length - 1];
    if (!ex || ex.title !== title) {
      ex = { title, notes: null, sets: [] };
      w.exercises.push(ex);
    }
    const weight = amount(r, 'weight');
    const distance = amount(r, 'distance');
    const set: HevySet = {
      type: 'normal',
      weightKg: weight != null ? weight * units.weightFactor : null,
      reps: amount(r, 'reps'),
      distanceM: distance != null ? distance * units.metresPerUnit : null,
      durationS: amount(r, 'seconds'),
      rpe: null,
    };
    ex.sets.push(set);
  }
  return { workouts: [...workouts.values()], skipped };
}
