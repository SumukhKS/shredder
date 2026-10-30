// The Profile graphs' sums, with no React Native imports so tests can run them directly.
import { addDays, fromDay, mondayOf } from './dates';

/** One day from the `profile_stats` function; a field is null when nothing was logged. */
export interface StatDay {
  day: string;
  workouts: number | null;
  volume: number | null;
  kcal: number | null;
  protein: number | null;
  steps: number | null;
  sleep_min: number | null;
  water_ml: number | null;
}

export interface ProfileStats {
  workouts: number;
  diet_days: number;
  step_goal_days: number;
  /** Mondays of every week with a workout, newest first. */
  weeks: string[];
  days: StatDay[];
}

export type Period = 'daily' | 'weekly' | 'monthly';
export type StatMetric = Exclude<keyof StatDay, 'day'>;

// These add up; the others are averaged over the days something was logged.
const SUMMED: StatMetric[] = ['workouts', 'volume'];

interface Bucket {
  /** Short text under the bar, empty where there isn't room. */
  label: string;
  /** Full name, for the readout. */
  name: string;
  has: (day: string) => boolean;
}

function buckets(period: Period, today: string): Bucket[] {
  if (period === 'daily') {
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(today, i - 6);
      const d = fromDay(key);
      return {
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        name: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
        has: (day) => day === key,
      };
    });
  }
  if (period === 'weekly') {
    const thisWeek = mondayOf(today);
    return Array.from({ length: 12 }, (_, i) => {
      const start = addDays(thisWeek, -7 * (11 - i));
      const end = addDays(start, 6);
      const text = fromDay(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      return { label: i % 3 === 0 ? text : '', name: `Week of ${text}`, has: (day) => day >= start && day <= end };
    });
  }
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m - 1 - (11 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      name: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      has: (day) => day.startsWith(key),
    };
  });
}

/** The bars for one graph, plus one number for the whole range. */
export function statSeries(days: StatDay[], metric: StatMetric, period: Period, today: string) {
  const summed = SUMMED.includes(metric);
  const combine = (rows: StatDay[]) => {
    const got = rows.map((r) => Number(r[metric] ?? 0)).filter((v) => v > 0);
    const total = got.reduce((a, b) => a + b, 0);
    return summed ? total : got.length ? total / got.length : 0;
  };
  const list = buckets(period, today);
  const inRange: StatDay[] = [];
  const values = list.map((b) => {
    const rows = days.filter((r) => b.has(r.day));
    inRange.push(...rows);
    return combine(rows);
  });
  return { values, labels: list.map((b) => b.label), names: list.map((b) => b.name), summary: combine(inRange) };
}
