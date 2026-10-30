// Checks for what people type and what imports bring in. No React Native imports, so tests can run it directly.

/** Limits for logged sets, in stored units. Keep in step with workout_sets_limits in the database. */
export const SET_LIMITS = {
  weight_kg: 1000,
  reps: 1000,
  duration_s: 86400,
  distance_m: 1000000,
} as const;

/** A typed amount as a number: "62,5" and "62.5" both work. Null for blank, negative or malformed text like "1.2.3". */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** What a decimal field keeps while typing: digits and one separator. */
export function cleanDecimal(text: string): string {
  const kept = text.replace(/[^0-9.,]/g, '');
  const at = kept.search(/[.,]/);
  return at < 0 ? kept : kept.slice(0, at + 1) + kept.slice(at + 1).replace(/[.,]/g, '');
}

/** What a whole-number field keeps while typing. */
export const cleanInteger = (text: string) => text.replace(/[^0-9]/g, '');

/** The value if it's a number within a set field's limit, otherwise null (for imported files). */
export function withinLimit(field: keyof typeof SET_LIMITS, value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value >= 0 && value <= SET_LIMITS[field] ? value : null;
}

const ALCOHOL = /\b(alcohol|beer|lager|ale|stout|wine|whisky|whiskey|vodka|rum|gin|tequila|brandy|liqueur|cider|malt liquor)\b/i;

export interface FoodNumbers {
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g?: number | null;
}

/**
 * Why a food's numbers can't be right, or null if they add up. Calories must be within 20% (at
 * least 15 kcal per 100 g) of what the macros supply: 4 kcal/g protein and carbs, 9 fat, 2 fibre.
 * Alcohol has calories of its own, so drinks may have more than their macros supply.
 * Keep in step with check_food_numbers in the database.
 */
export function foodProblem(f: FoodNumbers): string | null {
  const { kcal_100g: kcal, protein_100g: protein, carbs_100g: carbs, fat_100g: fat } = f;
  if (![kcal, protein, carbs, fat].every((v) => Number.isFinite(v) && v >= 0)) return 'Calories and macros must be numbers.';
  if (kcal <= 0) return 'Enter the calories.';
  if (protein + carbs + fat > 100.5) return 'Protein, carbs and fat add up to more than the food weighs.';
  if (kcal > 902) return 'That is more calories than any food can have: pure fat is 900 kcal per 100 g.';
  const fibre = Math.min(Math.max(f.fiber_100g ?? 0, 0), carbs);
  const supplied = protein * 4 + (carbs - fibre) * 4 + fibre * 2 + fat * 9;
  const gap = kcal - supplied;
  if (Math.abs(gap) <= Math.max(15, kcal * 0.2) || (gap > 0 && ALCOHOL.test(f.name))) return null;
  return gap < 0
    ? `These macros supply about ${Math.round(supplied)} kcal per 100 g, far more than the ${Math.round(kcal)} entered. Check the numbers. If it's high in fibre, enter the fibre too.`
    : `These macros supply about ${Math.round(supplied)} kcal per 100 g, far less than the ${Math.round(kcal)} entered. Check the numbers.`;
}
