import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatTimeShort } from '../src/lib/dates';
import { rankBySearch, rankExercises } from '../src/lib/search-rank';

const names = (list: string[], q: string) =>
  rankExercises(
    list.map((name) => ({ name })),
    q
  ).map((e) => e.name);

test('"dead" finds deadlifts before Dead Bug', () => {
  const out = names(
    ['Dead Bug', 'Dead Hang', 'Romanian Deadlift (Barbell)', 'Deadlift (Barbell)', 'Sumo Deadlift (Barbell)'],
    'dead'
  );
  assert.equal(out[0], 'Deadlift (Barbell)');
  assert.ok(out.indexOf('Romanian Deadlift (Barbell)') < out.indexOf('Dead Bug'));
  assert.ok(out.indexOf('Sumo Deadlift (Barbell)') < out.indexOf('Dead Bug'));
});

test('an exact name always comes first', () => {
  assert.equal(names(['Deadlift (Barbell)', 'Dead Bug'], 'dead bug')[0], 'Dead Bug');
});

test('a staple only gets a boost when it is what was typed', () => {
  assert.deepEqual(names(['Squat (Barbell)', 'Leg Raise'], 'leg'), ['Leg Raise', 'Squat (Barbell)']);
});

test('food: name start beats a word start, which beats contained text', () => {
  const foods = ['Peanut butter toast', 'Butter chicken', 'Buttermilk', 'Butter', 'Cocoa cookies with butterscotch'];
  assert.deepEqual(rankBySearch(foods, 'butter', (f) => f).slice(0, 3), ['Butter', 'Buttermilk', 'Butter chicken']);
});

test('a blank search leaves the order alone', () => {
  assert.deepEqual(
    rankBySearch(['b', 'a'], '  ', (f) => f),
    ['b', 'a']
  );
});

test('summaries show hours and minutes, never seconds', () => {
  assert.equal(formatTimeShort(3912), '1h 05m');
  assert.equal(formatTimeShort(2703), '45m');
  assert.equal(formatTimeShort(38), '0m');
});
