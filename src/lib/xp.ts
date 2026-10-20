/**
 * Level curve: reaching level L+1 from level L costs 100 * L XP.
 * Total XP to *be* level L is 50 * L * (L - 1).
 *   L1: 0, L2: 100, L3: 300, L4: 600, L5: 1000, L10: 4500, L20: 19000
 * A solid training day (workout + logging + water) is ~150 XP, so level 10
 * lands around the one-month mark and level 20 after a few months.
 */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number) {
  const level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * Math.max(0, xp)) / 100)) / 2));
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    intoLevel: xp - floor,
    levelSize: next - floor,
    toNext: next - xp,
    progress: (xp - floor) / (next - floor),
  };
}

const titles: [number, string][] = [
  [1, 'Fresh Start'],
  [3, 'Warm Up'],
  [5, 'Iron Curious'],
  [8, 'Rep Machine'],
  [12, 'Plate Stacker'],
  [16, 'Gym Regular'],
  [20, 'Barbell Bandit'],
  [25, 'Shred Lord'],
  [30, 'Legend'],
];

export function levelTitle(level: number): string {
  let title = titles[0][1];
  for (const [min, name] of titles) if (level >= min) title = name;
  return title;
}

export const XP_LABELS: Record<string, string> = {
  workout: 'Workout',
  food_log: 'Food logged',
  protein_goal: 'Protein goal',
  water_goal: 'Water goal',
  steps_goal: 'Step goal',
  sleep_goal: 'Sleep goal',
  weigh_in: 'Weigh-in',
  streak: 'Streak bonus',
};
