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

test('same exercise under another spelling is an exact match', () => {
  assert.equal(bestMatch('Shoulder Press (Machine Plates)', undefined, [lib('Shoulder Press (Machine)')])?.exact, true);
  assert.equal(bestMatch('Bicep Curl (Dumbbell)', undefined, [lib('Biceps Curl (Dumbbell)')])?.exact, true);
});

test('a near match is suggested but not treated as certain', () => {
  const m = bestMatch('Seated Incline Curl (Dumbbell)', undefined, [lib('Incline Curl (Dumbbell)')]);
  assert.equal(m?.match.name, 'Incline Curl (Dumbbell)');
  assert.equal(m?.exact, false);
});

test('aliases are sure matches, and a different logging type never auto-merges', () => {
  const custom = lib('Chest Fly (Machine)');
  const pec = lib('Pec Deck');
  const [s] = suggestMerges([custom], [pec], new Map([[aliasKey(custom.name), pec.id]]));
  assert.equal(s.match.name, 'Pec Deck');
  assert.equal(s.sure, true);
  const [run] = suggestMerges([lib('Running', 'distance_time')], [lib('Run', 'duration')]);
  assert.equal(run.sure, false);
});

test('blank and symbol-only names match nothing', () => {
  assert.equal(bestMatch('', undefined, [lib('Plank')]), null);
  assert.equal(bestMatch('!!!', undefined, [lib('Plank')]), null);
});
