// Real names from Hevy imports that once stayed unmapped. npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aliasKey, bestMatch, nameParts, suggestMerges } from '../src/lib/exercise-match';

const lib = (name: string, kind = 'weight_reps', equipment = 'other') => ({ id: name, name, kind, equipment });

test('alias keys ignore spacing, case and punctuation', () => {
  assert.equal(aliasKey('Hanging Leg Raises ( Weighted )'), aliasKey('hanging leg raises (weighted)'));
  assert.equal(aliasKey('Cable Fly & Crossover'), 'cableflyandcrossover');
});

test('plurals and spelling variants fold together', () => {
  assert.deepEqual(nameParts('Seated Chest Flys (Cable)').words, nameParts('Seated Chest Fly (Cable)').words);
  assert.deepEqual(nameParts('Rear Delts Fly').words, nameParts('Rear Deltoid Fly').words);
  assert.deepEqual(nameParts('Running').words, nameParts('Run').words);
  assert.equal(nameParts('Shoulder Press (Machine Plates)').equipment, 'machine');
  assert.equal(nameParts('Curl ( Dumbbell )').equipment, 'dumbbell');
});

test('never matches across equipment', () => {
  assert.equal(bestMatch('Bench Press (Dumbbell)', undefined, [lib('Bench Press (Barbell)')]), null);
  assert.equal(bestMatch('Lat Pulldown (Machine)', undefined, [lib('Lat Pulldown (Cable)')]), null);
});

test('only the same name is an exact match, ignoring case and surrounding spaces', () => {
  assert.equal(bestMatch(' bench press (BARBELL) ', undefined, [lib('Bench Press (Barbell)')])?.exact, true);
  assert.equal(bestMatch('Shoulder Press (Machine Plates)', undefined, [lib('Shoulder Press (Machine)')])?.exact, false);
  assert.equal(bestMatch('Bicep Curl (Dumbbell)', undefined, [lib('Biceps Curl (Dumbbell)')])?.exact, false);
  assert.equal(bestMatch('Pull-Up', undefined, [lib('Pull Up')])?.exact, false);
});

test('an exact name wins over a close one', () => {
  const m = bestMatch('Curl Hammer', undefined, [lib('Hammer Curl'), lib('Curl Hammer')]);
  assert.equal(m?.match.name, 'Curl Hammer');
  assert.equal(m?.exact, true);
});

test('a near match is suggested but not treated as certain', () => {
  const m = bestMatch('Seated Incline Curl (Dumbbell)', undefined, [lib('Incline Curl (Dumbbell)')]);
  assert.equal(m?.match.name, 'Incline Curl (Dumbbell)');
  assert.equal(m?.exact, false);
});

test('only exactly the same name is sure: aliases and close names wait for a person', () => {
  const custom = lib('Chest Fly (Machine)');
  const pec = lib('Pec Deck');
  const [s] = suggestMerges([custom], [pec], new Map([[aliasKey(custom.name), pec.id]]));
  assert.equal(s.match.name, 'Pec Deck');
  assert.equal(s.sure, false);
  const [lat] = suggestMerges([lib('Lat Pulldown (Machine)')], [lib('Front Pulldown (Machine)')]);
  assert.equal(lat?.sure ?? false, false);
  const [same] = suggestMerges([{ ...lib('Plank'), id: 'mine' }], [lib('Plank')]);
  assert.equal(same.sure, true);
  const [run] = suggestMerges([lib('Run', 'distance_time')], [lib('Run', 'duration')]);
  assert.equal(run.sure, false);
});

test('blank and symbol-only names match nothing', () => {
  assert.equal(bestMatch('', undefined, [lib('Plank')]), null);
  assert.equal(bestMatch('!!!', undefined, [lib('Plank')]), null);
});
