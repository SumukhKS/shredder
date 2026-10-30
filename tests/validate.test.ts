import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeTargets } from '../src/lib/nutrition';
import { cleanDecimal, cleanInteger, foodProblem, parseAmount, withinLimit } from '../src/lib/validate';

test('parseAmount reads both decimal separators and rejects anything malformed', () => {
  assert.equal(parseAmount('62.5'), 62.5);
  assert.equal(parseAmount('62,5'), 62.5);
  assert.equal(parseAmount(' 8 '), 8);
  assert.equal(parseAmount('.5'), 0.5);
  assert.equal(parseAmount('5.'), 5);
  assert.equal(parseAmount('0'), 0);
  for (const bad of ['', ' ', '.', ',', '1.2.3', '1,2,3', '-5', 'abc', '12a', '1e5', 'NaN', 'Infinity', '٣']) {
    assert.equal(parseAmount(bad), null, bad);
  }
});

test('input filters keep what can become a valid number', () => {
  assert.equal(cleanDecimal('1.2.3'), '1.23');
  assert.equal(cleanDecimal('1,2.3'), '1,23');
  assert.equal(cleanDecimal('-12a'), '12');
  assert.equal(cleanDecimal('😀'), '');
  assert.equal(cleanInteger('8-12'), '812');
  assert.equal(cleanInteger('8.5'), '85');
});

test('withinLimit drops impossible imported values', () => {
  assert.equal(withinLimit('reps', 12), 12);
  assert.equal(withinLimit('reps', 0), 0);
  assert.equal(withinLimit('reps', 1001), null);
  assert.equal(withinLimit('weight_kg', -5), null);
  assert.equal(withinLimit('weight_kg', NaN), null);
  assert.equal(withinLimit('duration_s', Infinity), null);
  assert.equal(withinLimit('distance_m', null), null);
  assert.equal(withinLimit('distance_m', undefined), null);
});

const food = (kcal: number, protein: number, carbs: number, fat: number, name = 'Food', fibre?: number) => ({
  name,
  kcal_100g: kcal,
  protein_100g: protein,
  carbs_100g: carbs,
  fat_100g: fat,
  fiber_100g: fibre,
});

test('foodProblem refuses numbers that cannot be right', () => {
  assert.match(foodProblem(food(20, 20, 0, 0))!, /supply about 80/);
  assert.match(foodProblem(food(500, 1, 1, 1))!, /far less/);
  assert.match(foodProblem(food(400, 60, 50, 10))!, /more than the food weighs/);
  assert.match(foodProblem(food(950, 0, 0, 100))!, /pure fat/);
  assert.ok(foodProblem(food(0, 0, 0, 0)));
  assert.ok(foodProblem(food(100, -1, 10, 5)));
  assert.ok(foodProblem(food(NaN, 1, 1, 1)));
});

test('foodProblem accepts real foods, including high fibre and alcohol', () => {
  assert.equal(foodProblem(food(165, 31, 0, 3.6, 'Chicken breast')), null);
  assert.equal(foodProblem(food(884, 0, 0, 100, 'Olive oil')), null);
  assert.equal(foodProblem(food(30, 0.7, 10.5, 0.2, 'Lime', 2.8)), null);
  assert.equal(foodProblem(food(85, 0.1, 2.8, 0, 'Red wine')), null);
  assert.equal(foodProblem(food(231, 0, 0, 0, 'Vodka')), null);
  // Alcohol only explains extra calories, not missing ones.
  assert.ok(foodProblem(food(20, 20, 0, 0, 'Beer')));
  // "ale" inside another word is not alcohol.
  assert.ok(foodProblem(food(300, 1, 1, 1, 'Kale chips')));
});

test('targets always add up to the calories', () => {
  for (const weightKg of [40, 70, 100, 180, 250]) {
    for (const goal of ['cut', 'maintain', 'bulk'] as const) {
      for (const sex of ['male', 'female'] as const) {
        const t = computeTargets({ sex, age: 30, heightCm: 170, weightKg, activity: 'sedentary', goal });
        const kcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
        assert.ok(Math.abs(kcal - t.calories) <= 8, `${weightKg} kg ${goal} ${sex}: ${kcal} vs ${t.calories}`);
        assert.ok(t.protein >= 0 && t.carbs >= 0 && t.fat >= 0);
      }
    }
  }
});
