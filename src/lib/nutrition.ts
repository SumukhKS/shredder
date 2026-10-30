import type { ActivityLevel, Food, Goal, Sex } from '@/types/db';

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

const GOAL_ADJUST: Record<Goal, number> = { cut: -0.2, maintain: 0, bulk: 0.1 };

/** Goal choices, as onboarding and Settings show them. */
export const GOALS: { key: Goal; title: string; detail: string }[] = [
  { key: 'cut', title: 'Lose fat', detail: 'Moderate deficit, high protein to keep muscle' },
  { key: 'maintain', title: 'Recomp and maintain', detail: 'Eat at maintenance, get stronger' },
  { key: 'bulk', title: 'Build muscle', detail: 'Small surplus for lean gains' },
];

export const ACTIVITY: { key: ActivityLevel; title: string; detail: string }[] = [
  { key: 'sedentary', title: 'Mostly sitting', detail: 'Desk job, little walking' },
  { key: 'light', title: 'Lightly active', detail: 'Training 1–3 days a week' },
  { key: 'moderate', title: 'Active', detail: 'Training 3–5 days a week' },
  { key: 'active', title: 'Very active', detail: 'Training 6–7 days or a physical job' },
  { key: 'athlete', title: 'Athlete', detail: 'Twice-a-day sessions' },
];

export interface TargetInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
}

/** Mifflin-St Jeor BMR -> TDEE -> goal-adjusted calories and macro split. */
export function computeTargets({ sex, age, heightCm, weightKg, activity, goal }: TargetInput) {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const tdee = bmr * ACTIVITY_FACTOR[activity];
  const calories = Math.round((tdee * (1 + GOAL_ADJUST[goal])) / 10) * 10;

  // Protein scales with goal: higher on a cut to protect muscle.
  const proteinPerKg = goal === 'cut' ? 2.2 : goal === 'bulk' ? 1.8 : 2.0;
  let protein = Math.round(weightKg * proteinPerKg);
  let fat = Math.round((calories * 0.25) / 9);
  // A heavy body on few calories: protein and fat can't take more than the calories allow. Fat gives
  // way first, down to 15% of calories, then protein.
  if (protein * 4 + fat * 9 > calories) {
    fat = Math.round(Math.max(calories * 0.15, calories - protein * 4) / 9);
    if (protein * 4 + fat * 9 > calories) protein = Math.floor((calories - fat * 9) / 4);
  }
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  const water = Math.round((weightKg * 35) / 250) * 250;

  return { calories, protein, carbs, fat, water, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
}

const macroKcal = (m: Macros) => m.protein * 4 + m.carbs * 4 + m.fat * 9;

/** Share of calories from each macro, in whole percent (null when there are no macros). */
export function macroSplit(m: Macros): Macros | null {
  const total = macroKcal(m);
  if (total <= 0) return null;
  const protein = Math.round(((m.protein * 4) / total) * 100);
  const fat = Math.round(((m.fat * 9) / total) * 100);
  return { protein, fat, carbs: 100 - protein - fat };
}

export const DEFAULT_SPLIT: Macros = { protein: 30, carbs: 45, fat: 25 };

/**
 * Grams for a calorie target at a given percentage split, with carbs taking up the
 * rounding so the grams add back up to the target.
 */
export function scaleMacros(split: Macros, calories: number): Macros {
  const protein = Math.round((calories * split.protein) / 100 / 4);
  const fat = Math.round((calories * split.fat) / 100 / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
}

export function macrosFor(food: Pick<Food, 'kcal_100g' | 'protein_100g' | 'carbs_100g' | 'fat_100g'>, grams: number) {
  const f = grams / 100;
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    kcal: r(food.kcal_100g * f),
    protein: r(food.protein_100g * f),
    carbs: r(food.carbs_100g * f),
    fat: r(food.fat_100g * f),
  };
}

export const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
] as const;

export function suggestMeal(date = new Date()) {
  const h = date.getHours();
  if (h < 11) return 'breakfast' as const;
  if (h < 16) return 'lunch' as const;
  if (h < 18) return 'snacks' as const;
  return 'dinner' as const;
}
