import assert from 'node:assert/strict';
import { test } from 'node:test';

import { statSeries, type StatDay } from '../src/lib/profile-stats';

const row = (day: string, extra: Partial<StatDay>): StatDay => ({
  day,
  workouts: null,
  volume: null,
  kcal: null,
  protein: null,
  steps: null,
  sleep_min: null,
  water_ml: null,
  ...extra,
});
const today = '2026-10-30'; // a Friday

test('workouts and volume add up across the range', () => {
  const days = [row('2026-10-30', { workouts: 2 }), row('2026-10-29', { workouts: 1 }), row('2026-10-01', { workouts: 5 })];
  const daily = statSeries(days, 'workouts', 'daily', today);
  assert.deepEqual(daily.values, [0, 0, 0, 0, 0, 1, 2]);
  assert.equal(daily.summary, 3);
  const monthly = statSeries(days, 'workouts', 'monthly', today);
  assert.equal(monthly.values.length, 12);
  assert.equal(monthly.values[11], 8);
});

test('calories average only over the days something was logged', () => {
  const days = [row('2026-10-30', { kcal: 2000 }), row('2026-10-28', { kcal: 1000 }), row('2026-10-27', { water_ml: 500 })];
  const s = statSeries(days, 'kcal', 'daily', today);
  assert.equal(s.summary, 1500);
  assert.equal(s.values[6], 2000);
  assert.equal(s.values[5], 0);
});

test('weeks start on Monday and days outside the range are left out', () => {
  const days = [row('2026-10-26', { volume: 100 }), row('2026-10-25', { volume: 50 }), row('2025-01-01', { volume: 9999 })];
  const s = statSeries(days, 'volume', 'weekly', today);
  assert.equal(s.values[11], 100);
  assert.equal(s.values[10], 50);
  assert.equal(s.summary, 150);
});

test('months cross a year boundary, and no data gives zeros', () => {
  const s = statSeries(
    [row('2025-12-31', { steps: 8000 }), row('2026-01-01', { steps: 4000 })],
    'steps',
    'monthly',
    '2026-02-15'
  );
  assert.deepEqual(s.values.slice(-3), [8000, 4000, 0]);
  const none = statSeries([], 'sleep_min', 'monthly', today);
  assert.equal(none.summary, 0);
  assert.ok(none.values.every((v) => v === 0));
});
