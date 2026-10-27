import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { StreakCard } from '@/components/streak-card';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space, withAlpha } from '@/constants/theme';
import { addDays, fromDay, mondayOf, toDay } from '@/lib/dates';
import { fetchWorkoutWeeks, weekStreaks } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { useSession } from '@/stores/session';

const WEEKS = 12;

/** Days with anything logged and days with a workout, over the last few weeks. */
async function fetchActivity(from: string) {
  const [logged, trained] = await Promise.all([
    supabase.from('xp_events').select('day').gte('day', from).limit(5000),
    supabase.from('workouts').select('day').gte('day', from),
  ]);
  return {
    logged: new Set((logged.data ?? []).map((r) => r.day as string)),
    trained: new Set((trained.data ?? []).map((r) => r.day as string)),
  };
}

export default function Streaks() {
  const c = useColors();
  const profile = useSession((s) => s.profile);
  const today = toDay();
  const start = addDays(mondayOf(today), -7 * (WEEKS - 1));
  const activity = useQuery(() => fetchActivity(start), start);
  const weeks = useQuery(fetchWorkoutWeeks);
  if (!profile) return null;
  const w = weeks.data ? weekStreaks(weeks.data) : undefined;
  const loggedDays = activity.data?.logged.size ?? 0;
  const trainedDays = activity.data?.trained.size ?? 0;

  return (
    <Screen padTop={false} refreshing={activity.refreshing} onRefresh={activity.refresh}>
      <Animated.View entering={FadeInDown.duration(400)}>
        <StreakCard profile={profile} weeks={w} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.stats}>
        <Stat label="Best day streak" value={`${profile.longest_streak} days`} />
        <Stat label="Best week streak" value={`${w?.best ?? 0} weeks`} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(400)}>
        <Card style={{ gap: Space.md }}>
          <AppText variant="h3">Last {WEEKS} weeks</AppText>
          <View style={styles.grid}>
            <View style={styles.labels}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
                <AppText key={i} variant="small" color="textMuted" style={styles.label}>
                  {l}
                </AppText>
              ))}
            </View>
            {Array.from({ length: WEEKS }, (_, wk) => (
              <View key={wk} style={styles.week}>
                {Array.from({ length: 7 }, (_, d) => {
                  const day = addDays(start, wk * 7 + d);
                  const future = day > today;
                  const trained = activity.data?.trained.has(day);
                  const logged = activity.data?.logged.has(day);
                  return (
                    <View
                      key={d}
                      accessibilityLabel={`${fromDay(day).toDateString()}: ${trained ? 'trained' : logged ? 'logged' : 'nothing'}`}
                      style={[
                        styles.cell,
                        {
                          backgroundColor: future
                            ? 'transparent'
                            : trained
                              ? c.primary
                              : logged
                                ? withAlpha(c.primary, 0.35)
                                : c.hairline,
                          borderWidth: day === today ? 1.5 : 0,
                          borderColor: c.text,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <Legend color={c.primary} label={`Trained (${trainedDays})`} />
            <Legend color={withAlpha(c.primary, 0.35)} label={`Logged (${loggedDays})`} />
            <Legend color={c.hairline} label="Nothing" />
          </View>
          <AppText variant="small" color="textMuted">
            Log anything (food, water, steps, sleep, a weigh-in or a workout) to keep the day streak. Train once a week to
            keep the week streak.
          </AppText>
        </Card>
      </Animated.View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
      <AppText variant="stat">{value}</AppText>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: Space.md },
  grid: { flexDirection: 'row', gap: 4 },
  labels: { gap: 4, marginRight: 2 },
  label: { height: 18, lineHeight: 18, fontSize: 10 },
  week: { flex: 1, gap: 4 },
  cell: { height: 18, borderRadius: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
});
