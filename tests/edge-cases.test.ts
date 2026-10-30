import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDays, fromDay, mondayOf, toDay } from '../src/lib/dates';
import { parseAmount, withinLimit } from '../src/lib/validate';
import { weekBoundaryCheck } from './helpers/week';

test('days cross month, year and leap-year boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(toDay(fromDay('2026-03-29')), '2026-03-29');
});

test('a week starts on Monday, including across a year', () => {
  assert.equal(mondayOf('2026-10-30'), '2026-10-26');
  assert.equal(mondayOf('2026-10-26'), '2026-10-26');
  assert.equal(mondayOf('2026-11-01'), '2026-10-26');
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
  assert.ok(weekBoundaryCheck());
});

test('amounts refuse anything that is not a plain number', () => {
  for (const bad of ['', ' ', 'abc', '1.2.3', '1,2,3', '💪', 'NaN', 'Infinity', '1e999', '--5']) {
    assert.equal(parseAmount(bad), null, JSON.stringify(bad));
  }
});

test('values no real set could have are dropped', () => {
  assert.equal(withinLimit('reps', 10_000_000), null);
  assert.equal(withinLimit('weight_kg', 10_000_000), null);
  assert.equal(withinLimit('reps', -1), null);
  assert.equal(withinLimit('reps', 12), 12);
  assert.equal(withinLimit('reps', null), null);
});
