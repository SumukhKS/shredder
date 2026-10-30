export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type Goal = 'cut' | 'maintain' | 'bulk';
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export type SetType = 'warmup' | 'normal' | 'drop' | 'failure';
export type ExerciseKind = 'weight_reps' | 'bodyweight_reps' | 'duration' | 'distance_time';

export interface Profile {
  id: string;
  display_name: string | null;
  sex: Sex | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  calorie_target: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml_target: number;
  steps_target: number;
  sleep_min_target: number;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_active_day: string | null;
  onboarded: boolean;
  tour_seen?: boolean;
  share_id?: string;
  bio?: string | null;
  /** YYYY-MM-DD */
  birthday?: string | null;
  avatar_url?: string | null;
}

export interface Exercise {
  id: string;
  name: string;
  primary_muscle: string;
  secondary_muscles: string[];
  equipment: string;
  kind: ExerciseKind;
  created_by: string | null;
  /** ExerciseDB id: an animated GIF of the movement */
  gif_id?: string | null;
  /** free-exercise-db id: photos of the start and end of the movement (fallback) */
  media_id?: string | null;
  instructions?: string[];
}

export interface Routine {
  id: string;
  name: string;
  notes: string | null;
  updated_at: string;
  routine_exercises: RoutineExercise[];
}

export interface RoutineExercise {
  id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string;
  rest_seconds: number;
  /** One entry per set. Null on routines from before set rows: use `routineTargets`. */
  set_targets?: { reps: number | null }[] | null;
  rest_enabled?: boolean;
  exercises: Exercise;
}

export interface WorkoutSummary {
  id: string;
  name: string;
  day: string;
  started_at: string;
  duration_s: number;
  total_volume: number;
  total_sets: number;
  pr_count: number;
}

export interface Food {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  source: 'seed' | 'off' | 'custom' | 'usda';
  serving_label: string;
  serving_g: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g?: number | null;
  created_by?: string | null;
}

export interface FoodLog {
  id: string;
  day: string;
  meal: Meal;
  food_id: string | null;
  food_name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  created_at: string;
}

export interface DailyHealth {
  day: string;
  steps: number | null;
  sleep_min: number | null;
  source?: 'manual' | 'healthkit' | 'health_connect' | 'phone_sensor';
}

/** One day's body measurements; any of them may be missing. Weight in kg, lengths in cm. */
export interface BodyMetric {
  day: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  neck_cm: number | null;
  shoulders_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  arm_cm: number | null;
  forearm_cm: number | null;
  thigh_cm: number | null;
  calf_cm: number | null;
}

export interface FinishWorkoutResult {
  workout_id: string;
  xp: number;
  total_volume: number;
  total_sets: number;
  prs: { exercise_id: string; name: string; e1rm: number; previous: number }[];
  /** Saved on the phone and not yet on the server. */
  waiting?: boolean;
}
