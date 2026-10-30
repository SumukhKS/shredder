import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { AxisBarChart } from '@/components/charts';
import { MuscleMap } from '@/components/muscle-map';
import { ProfileCard } from '@/components/profile-card';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { EmptyState, Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import { fetchProfileStats, fetchWeekExercises } from '@/lib/profile';
import { statSeries, type Period, type StatDay, type StatMetric } from '@/lib/profile-stats';
import { weekStreaks } from '@/lib/streak';
import { useUnits, weightNumber } from '@/lib/units';
import { useQuery } from '@/lib/use-query';
import { useSession } from '@/stores/session';

async function load() {
  const [stats, exercises] = await Promise.all([fetchProfileStats(), fetchWeekExercises()]);
  return { stats, exercises };
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];
const RANGE: Record<Period, string> = { daily: 'last 7 days', weekly: 'last 12 weeks', monthly: 'last 12 months' };

const hoursText = (v: number) => {
  const minutes = Math.round(v * 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};
const rounded = (v: number) => Math.round(v).toLocaleString();

export default function ProfileTab() {
  const c = useColors();
  const profile = useSession((s) => s.profile);
  const u = useUnits().weight;
  const q = useQuery(load, '', { cache: 'profile-stats' });
  const shareRef = useRef<React.ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);
  const [period, setPeriod] = useState<Period>('weekly');

  if (!profile) return null;
  const d = q.data;

  async function share() {
    setSharing(true);
    try {
      const uri = await captureRef(shareRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your profile' });
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSharing(false);
    }
  }

  const graphs: {
    metric: StatMetric;
    title: string;
    scale?: (v: number) => number;
    goal?: number;
    text: (v: number) => string;
    minTop?: number;
    summed?: boolean;
  }[] = [
    { metric: 'workouts', title: 'Workouts', text: rounded, minTop: 4, summed: true },
    {
      metric: 'volume',
      title: 'Volume',
      scale: (v) => weightNumber(v, u),
      text: (v) => `${rounded(v)} ${u}`,
      summed: true,
    },
    { metric: 'kcal', title: 'Calories', goal: profile.calorie_target, text: (v) => `${rounded(v)} kcal` },
    { metric: 'protein', title: 'Protein', goal: profile.protein_g, text: (v) => `${rounded(v)} g` },
    { metric: 'sleep_min', title: 'Sleep', scale: (v) => v / 60, goal: profile.sleep_min_target / 60, text: hoursText },
    { metric: 'steps', title: 'Steps', goal: profile.steps_target, text: rounded },
    {
      metric: 'water_ml',
      title: 'Water',
      scale: (v) => v / 1000,
      goal: profile.water_ml_target / 1000,
      text: (v) => `${(Math.round(v * 10) / 10).toLocaleString()} L`,
    },
  ];
  const days: StatDay[] = d?.stats.days ?? [];

  return (
    <Screen
      title="Profile"
      refreshing={q.refreshing}
      onRefresh={q.refresh}
      right={
        <View style={styles.icons}>
          <IconButton icon="create-outline" label="Edit profile" onPress={() => router.push('/profile/edit')} />
          <IconButton icon={sharing ? 'hourglass-outline' : 'share-social-outline'} label="Share profile" onPress={share} />
          <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
        </View>
      }>
      <View ref={shareRef} collapsable={false} style={{ backgroundColor: c.bg }}>
        <ProfileCard
          profile={profile}
          totals={
            d
              ? {
                  workouts: d.stats.workouts,
                  dietDays: d.stats.diet_days,
                  stepGoalDays: d.stats.step_goal_days,
                  weekStreak: weekStreaks(d.stats.weeks).current,
                }
              : undefined
          }
        />
      </View>

      {!d && q.error ? (
        <EmptyState
          title="Couldn't load your stats"
          body={q.error}
          action={<Button label="Try again" variant="secondary" icon="refresh" onPress={q.reload} />}
        />
      ) : null}

      <Card style={{ gap: Space.md }}>
        <AppText variant="h3">Muscles this week</AppText>
        {d?.exercises.length ? (
          <MuscleMap exercises={d.exercises} />
        ) : (
          <AppText color="textMuted">Train this week and the muscles you work light up here.</AppText>
        )}
      </Card>

      <SectionHeader title="Trends" />
      <Segmented<Period> options={PERIODS} value={period} onChange={setPeriod} />
      {graphs.map((g) => {
        const s = statSeries(days, g.metric, period, toDay());
        const scale = g.scale ?? ((v: number) => v);
        return (
          <Card key={g.metric} style={{ gap: Space.sm }}>
            <View style={styles.row}>
              <AppText variant="h3">{g.title}</AppText>
              <View style={{ flex: 1 }} />
              {g.goal ? (
                <AppText variant="small" color="textMuted">
                  Goal {g.text(g.goal)}
                </AppText>
              ) : null}
            </View>
            <View>
              <AppText variant="stat">{s.summary ? g.text(scale(s.summary)) : '-'}</AppText>
              <AppText variant="small" color="textMuted">
                {g.summed ? 'Total' : 'Average per logged day'}, {RANGE[period]}
              </AppText>
            </View>
            <AxisBarChart
              values={s.values.map(scale)}
              labels={s.labels}
              names={s.names}
              goal={g.goal}
              format={g.text}
              minTop={g.minTop}
            />
          </Card>
        );
      })}

      <SectionHeader title="Body" />
      <Card style={{ gap: Space.md }}>
        {profile.weight_kg ? (
          <View style={styles.row}>
            <AppText variant="hero">{weightNumber(profile.weight_kg, u)}</AppText>
            <AppText variant="h3" color="textMuted">
              {u}
            </AppText>
          </View>
        ) : (
          <AppText color="textMuted">Weigh in each morning for the clearest trend.</AppText>
        )}
        <Button
          label="Measurements and trends"
          icon="body-outline"
          variant="secondary"
          onPress={() => router.push('/measurements')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icons: { flexDirection: 'row', gap: Space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
});
