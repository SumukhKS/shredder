// Fitness formulas for Settings > Calculators. Metric in, metric out (kg, cm); the screen converts units.
import type { Sex } from '@/types/db';

/** Basal metabolic rate, Mifflin-St Jeor (kcal a day). */
export function bmr(sex: Sex, age: number, heightCm: number, weightKg: number) {
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161));
}

/** Basal metabolic rate from lean mass, Katch-McArdle, when body fat is known. */
export function bmrLean(weightKg: number, bodyFatPct: number) {
  return Math.round(370 + 21.6 * weightKg * (1 - bodyFatPct / 100));
}

export function bmi(heightCm: number, weightKg: number) {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(v: number) {
  if (v < 18.5) return 'Underweight';
  if (v < 25) return 'Healthy';
  if (v < 30) return 'Overweight';
  return 'Obese';
}

/** Weights for a BMI of 18.5 to 24.9 at this height. */
export function healthyWeightRange(heightCm: number): [number, number] {
  const m2 = (heightCm / 100) ** 2;
  return [Math.round(18.5 * m2 * 10) / 10, Math.round(24.9 * m2 * 10) / 10];
}

/** Ideal body weight, Devine formula (kg). */
export function idealWeight(sex: Sex, heightCm: number) {
  const inchesOver5ft = Math.max(0, heightCm / 2.54 - 60);
  return Math.round(((sex === 'male' ? 50 : 45.5) + 2.3 * inchesOver5ft) * 10) / 10;
}

/** Body fat %, U.S. Navy tape method. Hips only count for women. Null when the tape numbers can't be right. */
export function navyBodyFat(sex: Sex, heightCm: number, neckCm: number, waistCm: number, hipsCm = 0): number | null {
  const pct =
    sex === 'male'
      ? waistCm > neckCm
        ? 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450
        : NaN
      : waistCm + hipsCm > neckCm
        ? 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipsCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450
        : NaN;
  return Number.isFinite(pct) && pct > 0 && pct < 75 ? Math.round(pct * 10) / 10 : null;
}

export type SkinfoldMethod = 'jp3' | 'jp7' | 'dw4';

/** The skinfold sites each method measures, in millimetres. */
export function skinfoldSites(method: SkinfoldMethod, sex: Sex): string[] {
  if (method === 'jp7') return ['Chest', 'Midaxillary', 'Triceps', 'Subscapular', 'Abdomen', 'Suprailiac', 'Thigh'];
  if (method === 'dw4') return ['Biceps', 'Triceps', 'Subscapular', 'Suprailiac'];
  return sex === 'male' ? ['Chest', 'Abdomen', 'Thigh'] : ['Triceps', 'Suprailiac', 'Thigh'];
}

// Durnin-Womersley (1974) by age band: [up to this age, intercept, slope].
const DW_MALE = [
  [19, 1.162, 0.063],
  [29, 1.1631, 0.0632],
  [39, 1.1422, 0.0544],
  [49, 1.162, 0.07],
  [Infinity, 1.1715, 0.0779],
];
const DW_FEMALE = [
  [19, 1.1549, 0.0678],
  [29, 1.1599, 0.0717],
  [39, 1.1423, 0.0632],
  [49, 1.1333, 0.0612],
  [Infinity, 1.1339, 0.0645],
];

/**
 * Body fat % from caliper readings (mm): Jackson-Pollock 3 or 7 site, or Durnin-Womersley 4 site,
 * with density turned into a percentage by the Siri equation. Null until every site has a reading.
 */
export function skinfoldBodyFat(method: SkinfoldMethod, sex: Sex, age: number, mm: number[]): number | null {
  if (age <= 0 || mm.length !== skinfoldSites(method, sex).length || mm.some((v) => !(v > 0))) return null;
  const sum = mm.reduce((a, b) => a + b, 0);
  let density: number;
  if (method === 'jp3') {
    density =
      sex === 'male'
        ? 1.10938 - 0.0008267 * sum + 0.0000016 * sum ** 2 - 0.0002574 * age
        : 1.0994921 - 0.0009929 * sum + 0.0000023 * sum ** 2 - 0.0001392 * age;
  } else if (method === 'jp7') {
    density =
      sex === 'male'
        ? 1.112 - 0.00043499 * sum + 0.00000055 * sum ** 2 - 0.00028826 * age
        : 1.097 - 0.00046971 * sum + 0.00000056 * sum ** 2 - 0.00012828 * age;
  } else {
    const [, c, m] = (sex === 'male' ? DW_MALE : DW_FEMALE).find(([upTo]) => age <= upTo)!;
    density = c - m * Math.log10(sum);
  }
  const pct = 495 / density - 450;
  return Number.isFinite(pct) && pct > 0 && pct < 75 ? Math.round(pct * 10) / 10 : null;
}

/** Body fat % estimated from BMI, Deurenberg (1991). The roughest method: it can't see muscle. */
export function bmiBodyFat(sex: Sex, age: number, heightCm: number, weightKg: number): number | null {
  if (age <= 0 || heightCm <= 0 || weightKg <= 0) return null;
  const pct = 1.2 * (weightKg / (heightCm / 100) ** 2) + 0.23 * age - 10.8 * (sex === 'male' ? 1 : 0) - 5.4;
  return Number.isFinite(pct) && pct > 0 && pct < 75 ? Math.round(pct * 10) / 10 : null;
}

export function bodyFatCategory(sex: Sex, pct: number) {
  const [essential, athlete, fit, average] = sex === 'male' ? [6, 14, 18, 25] : [14, 21, 25, 32];
  if (pct < essential) return 'Essential fat';
  if (pct < athlete) return 'Athletic';
  if (pct < fit) return 'Fit';
  if (pct < average) return 'Average';
  return 'Above average';
}

/** Estimated one-rep max: Epley for 1-10 reps, averaged with Brzycki, which holds up better past that. */
export function oneRepMax(weight: number, reps: number) {
  if (reps <= 1) return weight;
  const epley = weight * (1 + reps / 30);
  const brzycki = reps < 37 ? (weight * 36) / (37 - reps) : epley;
  return Math.round((reps <= 10 ? epley : (epley + brzycki) / 2) * 10) / 10;
}

/** About how many reps you can do at each % of your one-rep max. */
export const PERCENT_REPS: [number, number][] = [
  [100, 1],
  [95, 2],
  [90, 4],
  [85, 6],
  [80, 8],
  [75, 10],
  [70, 12],
  [65, 15],
  [60, 20],
];

/** Daily water, 35 ml per kg plus 500 ml per hour of training, to the nearest 250 ml. */
export function waterMl(weightKg: number, trainingHours = 0) {
  return Math.round((weightKg * 35 + trainingHours * 500) / 250) * 250;
}

export const MACRO_PRESETS: { key: string; label: string; protein: number; carbs: number; fat: number }[] = [
  { key: 'balanced', label: 'Balanced', protein: 30, carbs: 40, fat: 30 },
  { key: 'high-protein', label: 'High protein', protein: 40, carbs: 35, fat: 25 },
  { key: 'low-carb', label: 'Low carb', protein: 40, carbs: 20, fat: 40 },
  { key: 'high-carb', label: 'High carb', protein: 25, carbs: 55, fat: 20 },
  { key: 'keto', label: 'Keto', protein: 25, carbs: 5, fat: 70 },
];

/** Grams of each macro for a calorie total at a % split. */
export function macroGrams(calories: number, split: { protein: number; carbs: number; fat: number }) {
  return {
    protein: Math.round((calories * split.protein) / 100 / 4),
    carbs: Math.round((calories * split.carbs) / 100 / 4),
    fat: Math.round((calories * split.fat) / 100 / 9),
  };
}
