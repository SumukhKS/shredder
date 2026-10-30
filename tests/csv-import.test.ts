import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMeasurements,
  buildWorkouts,
  guessColumns,
  MEASUREMENT_FIELDS,
  parseCsv,
  parseCsvDate,
  WORKOUT_FIELDS,
} from '../src/lib/csv-import';

const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

test('dates are read in the common formats and impossible ones refused', () => {
  assert.equal(ymd(parseCsvDate('2026-10-30')), '2026-10-30');
  assert.equal(ymd(parseCsvDate('30/10/2026')), '2026-10-30');
  assert.equal(ymd(parseCsvDate('10/30/2026')), '2026-10-30');
  assert.equal(ymd(parseCsvDate('03/04/2026')), '2026-4-3');
  assert.equal(ymd(parseCsvDate('30 Oct 2026')), '2026-10-30');
  assert.equal(ymd(parseCsvDate('October 30, 2026')), '2026-10-30');
  assert.equal(parseCsvDate('2026-10-30 18:45:10')?.getHours(), 18);
  assert.equal(parseCsvDate('30 Oct 2026, 6:05 pm')?.getHours(), 18);
  for (const bad of ['', 'yesterday', '31/02/2026', '2026-13-01', '42']) assert.equal(parseCsvDate(bad), null);
});

test('columns are guessed from their headers, each used once', () => {
  const map = guessColumns(['Date', 'Weight (kg)', 'Waist', 'Notes'], MEASUREMENT_FIELDS);
  assert.deepEqual([map.day, map.weight_kg, map.waist_cm, map.chest_cm], [0, 1, 2, undefined]);
  const w = guessColumns(['Workout Name', 'Date', 'Exercise Name', 'Weight', 'Reps'], WORKOUT_FIELDS);
  assert.deepEqual([w.name, w.date, w.exercise, w.weight, w.reps], [0, 1, 2, 3, 4]);
});

test('measurements keep only real values, so empty cells cannot erase anything', () => {
  const rows = parseCsv(
    'Date,Weight,Waist\n2026-10-01,180,\nnot a date,80,80\n2026-10-02,,85\n2026-10-03,5000,abc\n2026-10-04,,'
  );
  const out = buildMeasurements(
    rows.slice(1),
    { day: 0, weight_kg: 1, waist_cm: 2 },
    { weightFactor: 0.45359237, lengthFactor: 1 }
  );
  assert.deepEqual(out.rows, [
    { day: '2026-10-01', values: { weight_kg: 81.6 } },
    { day: '2026-10-02', values: { waist_cm: 85 } },
  ]);
  assert.equal(out.badDates, 1);
  assert.equal(out.badCells, 2);
});

test('workouts group by date and name, with sets in file order', () => {
  const rows = parseCsv(
    'Date,Workout,Exercise,Weight,Reps\n2026-10-01,Push,Bench,100,5\n2026-10-01,Push,Bench,100,4\n2026-10-01,Push,Fly,20,10\n2026-10-02,Push,Bench,90,8\n,Push,Bench,1,1\n2026-10-03,Legs,,1,1'
  );
  const out = buildWorkouts(
    rows.slice(1),
    { date: 0, name: 1, exercise: 2, weight: 3, reps: 4 },
    { weightFactor: 1, metresPerUnit: 1 }
  );
  assert.equal(out.workouts.length, 2);
  assert.equal(out.skipped, 2);
  assert.deepEqual(
    out.workouts[0].exercises.map((e) => [e.title, e.sets.length]),
    [
      ['Bench', 2],
      ['Fly', 1],
    ]
  );
  assert.equal(out.workouts[0].exercises[0].sets[1].reps, 4);
  // The same file gives the same ids, so importing it twice skips the second time.
  const again = buildWorkouts(
    rows.slice(1),
    { date: 0, name: 1, exercise: 2, weight: 3, reps: 4 },
    { weightFactor: 1, metresPerUnit: 1 }
  );
  assert.equal(again.workouts[0].externalId, out.workouts[0].externalId);
});
