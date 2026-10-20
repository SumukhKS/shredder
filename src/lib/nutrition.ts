import type { ActivityLevel, Food, Goal, Sex } from '@/types/db';

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

const GOAL_ADJUST: Record<Goal, number> = { cut: -0.2, maintain: 0, bulk: 0.1 };

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
  const protein = Math.round(weightKg * proteinPerKg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  const water = Math.round((weightKg * 35) / 250) * 250;

  return { calories, protein, carbs, fat, water, bmr: Math.round(bmr), tdee: Math.round(tdee) };
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
