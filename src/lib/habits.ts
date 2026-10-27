import type { Ionicons } from '@expo/vector-icons';

import type { Habit } from '@/lib/daily';
import type { Profile } from '@/types/db';

interface HabitMeta {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Goal in the habit's stored unit (ml, steps, minutes). */
  target: (p: Profile) => number;
  /** A stored value for display. */
  format: (v: number) => string;
}

const hours = (min: number) => (min ? `${Math.floor(min / 60)}h ${min % 60}m` : '–');

export const HABITS: Record<Habit, HabitMeta> = {
  water: {
    title: 'Water',
    icon: 'water',
    target: (p) => p.water_ml_target,
    format: (ml) => `${Math.round(ml / 10) / 100} L`,
  },
  steps: {
    title: 'Steps',
    icon: 'footsteps',
    target: (p) => p.steps_target,
    format: (n) => n.toLocaleString(),
  },
  sleep: {
    title: 'Sleep',
    icon: 'moon',
    target: (p) => p.sleep_min_target,
    format: hours,
  },
};

export const isHabit = (v: unknown): v is Habit => v === 'water' || v === 'steps' || v === 'sleep';
