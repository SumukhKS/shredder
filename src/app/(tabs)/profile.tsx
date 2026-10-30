import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { BarChart, LineChart } from '@/components/charts';
import { MuscleMap } from '@/components/muscle-map';
import { NumberSheet } from '@/components/number-sheet';
import { ProfileCard } from '@/components/profile-card';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { ProgressBar } from '@/components/ui/progress';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { addDays, formatDuration, fromDay, mondayOf, toDay } from '@/lib/dates';
import { fetchBodyMetrics, fetchDashboard, fetchProfileTotals, MEASURES, saveBodyMetrics } from '@/lib/profile';
import { fetchWorkoutWeeks, refreshStreaks, weekStreaks } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { formatLength, formatVolume, formatWeight, toKg, useUnits, weightNumber } from '@/lib/units';
import { useQuery } from '@/lib/use-query';
import { useSession } from '@/stores/session';
import type { BodyMetric } from '@/types/db';

interface ProfileData {
  totals: Awaited<ReturnType<typeof fetchProfileTotals>>;
  dash: Awaited<ReturnType<typeof fetchDashboard>>;
  metrics: BodyMetric[];
  weeks: { week: string; volume: number }[];
  bestWeekStreak: number;
}

async function load(stepsTarget: number): Promise<ProfileData> {
  const since = mondayOf(addDays(toDay(), -7 * 7));
  const [totals, dash, metrics, v, weeks] = await Promise.all([
    fetchProfileTotals(stepsTarget),
    fetchDashboard(),
    fetchBodyMetrics(120),
    supabase.from('weekly_volume').select('week, volume').gte('week', since).order('week'),
    fetchWorkoutWeeks(),
  ]);
  return {
    totals,
    dash,
    metrics,
    weeks: (v.data ?? []) as ProfileData['weeks'],
    bestWeekStreak: weekStreaks(weeks).best,
  };
}

type Habit = 'diet' | 'sleep' | 'steps' | 'water';

export default function ProfileTab() {
  const c = useColors();
  const profile = useSession((s) => s.profile);
  const units = useUnits();
  const u = units.weight;
  const stepsTarget = profile?.steps_target ?? 0;
  const q = useQuery(() => load(stepsTarget), String(stepsTarget), { cache: 'profile' });
  const shareRef = useRef<React.ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [habit, setHabit] = useState<Habit>('diet');

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

  // Body weight: only days with a weigh-in.
  const weights = (d?.metrics ?? []).filter((m) => m.weight_kg != null) as (BodyMetric & { weight_kg: number })[];
  const latest = weights[weights.length - 1];
  const first = weights[0];
  const change = latest && first ? Number(latest.weight_kg) - Number(first.weight_kg) : 0;
  // Latest value of each tape measurement.
  const lastMeasures = MEASURES.filter((m) => m.kind === 'length')
    .map((m) => ({ m, row: [...(d?.metrics ?? [])].reverse().find((r) => r[m.key] != null) }))
    .filter((x) => x.row)
    .slice(0, 4);

  const thisWeek = mondayOf(toDay());
  const weekKeys = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, -7 * (7 - i)));
  const volumeByWeek = new Map((d?.weeks ?? []).map((x) => [x.week, Number(x.volume)]));
  const weekVolumes = weekKeys.map((k) => volumeByWeek.get(k) ?? 0);
  const weekLabels = weekKeys.map((k, i) => {
    const date = fromDay(k);
    const newMonth = i === 0 || fromDay(weekKeys[i - 1]).getMonth() !== date.getMonth();
    return newMonth ? `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()}` : String(date.getDate());
  });

  const days = d?.dash.days ?? [];
  const avg = (xs: (number | null)[]) => {
    const got = xs.filter((x): x is number => x != null && x > 0);
    return got.length ? got.reduce((a, b) => a + b, 0) / got.length : 0;
  };
  const HABITS: Record<Habit, { label: string; values: number[]; average: number; target: number; text: (v: number) => string }> =
    {
      diet: {
        label: 'Calories',
        values: days.map((x) => x.kcal ?? 0),
        average: avg(days.map((x) => x.kcal)),
        target: profile.calorie_target,
        text: (v) => `${Math.round(v).toLocaleString()} kcal`,
      },
      sleep: {
        label: 'Sleep',
        values: days.map((x) => Math.round(((x.sleepMin ?? 0) / 60) * 10) / 10),
        average: avg(days.map((x) => x.sleepMin)) / 60,
        target: profile.sleep_min_target / 60,
        text: (v) => `${Math.floor(v)}h ${String(Math.round((v % 1) * 60)).padStart(2, '0')}m`,
      },
      steps: {
        label: 'Steps',
        values: days.map((x) => x.steps ?? 0),
        average: avg(days.map((x) => x.steps)),
        target: profile.steps_target,
        text: (v) => Math.round(v).toLocaleString(),
      },
      water: {
        label: 'Water',
        values: days.map((x) => x.waterMl / 1000),
        average: avg(days.map((x) => x.waterMl)) / 1000,
        target: profile.water_ml_target / 1000,
        text: (v) => `${(Math.round(v * 10) / 10).toLocaleString()} L`,
      },
    };
  const h = HABITS[habit];
  const proteinAvg = avg(days.map((x) => x.protein));

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
        <ProfileCard profile={profile} totals={d?.totals} />
      </View>

      <SectionHeader title="This week" />
      <Card style={{ gap: Space.md }}>
        <View style={styles.stats}>
          <Mini label="Workouts" value={String(d?.dash.week.workouts ?? 0)} />
          <Mini label="Sets" value={String(d?.dash.week.sets ?? 0)} />
          <Mini
            label="Time"
            value={d?.dash.week.durationS ? formatDuration(d.dash.week.durationS).replace(/ \d+s$/, '') : '0m'}
          />
        </View>
        <AppText variant="small" color="textMuted">
          {formatVolume(d?.dash.week.volume ?? 0, u)} lifted. Best run: {d?.bestWeekStreak ?? 0} weeks in a row.
        </AppText>
        {d?.dash.week.exercises.length ? (
          <MuscleMap exercises={d.dash.week.exercises} />
        ) : (
          <AppText color="textMuted">Train this week and the muscles you work light up here.</AppText>
        )}
      </Card>

      <SectionHeader title="Last 7 days" />
      <Card style={{ gap: Space.md }}>
        <Segmented<Habit>
          options={[
            { key: 'diet', label: 'Diet' },
            { key: 'sleep', label: 'Sleep' },
            { key: 'steps', label: 'Steps' },
            { key: 'water', label: 'Water' },
          ]}
          value={habit}
          onChange={setHabit}
        />
        <View style={{ gap: Space.xs }}>
          <AppText variant="small" color="textMuted">
            Average {h.label.toLowerCase()} on logged days
          </AppText>
          <View style={styles.row}>
            <AppText variant="h1">{h.average ? h.text(h.average) : '-'}</AppText>
            <View style={{ flex: 1 }} />
            <AppText variant="small" color="textMuted">
              goal {h.text(h.target)}
            </AppText>
          </View>
          <ProgressBar value={h.target ? Math.min(1, h.average / h.target) : 0} color={c.primary} height={8} />
        </View>
        <BarChart
          values={h.values}
          labels={days.map((x) => fromDay(x.day).toLocaleDateString(undefined, { weekday: 'narrow' }))}
          color={c.primary}
          height={130}
        />
        {habit === 'diet' ? (
          <AppText variant="small" color="textMuted">
            Protein averaged {Math.round(proteinAvg)} g of your {profile.protein_g} g goal.
          </AppText>
        ) : null}
      </Card>

      <SectionHeader
        title="Body"
        action={<Button label="Log" icon="add" size="sm" variant="secondary" onPress={() => setLogging(true)} />}
      />
      <Card style={{ gap: Space.md }}>
        {latest ? (
          <>
            <View style={styles.row}>
              <AppText variant="hero">{weightNumber(latest.weight_kg, u)}</AppText>
              <AppText variant="h3" color="textMuted">
                {u}
              </AppText>
              <View style={{ flex: 1 }} />
              {weights.length > 1 ? (
                <AppText variant="bodyBold" color={change <= 0 ? 'success' : 'accent'}>
                  {change > 0 ? '+' : ''}
                  {weightNumber(change, u).toFixed(1)} {u}
                </AppText>
              ) : null}
            </View>
            {weights.length > 1 ? (
              <LineChart
                values={weights.map((x) => weightNumber(x.weight_kg, u))}
                labels={weights.map((x) => fromDay(x.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}
                color={c.primary}
                height={180}
              />
            ) : (
              <AppText variant="small" color="textMuted">
                Log again on another day to see your trend.
              </AppText>
            )}
          </>
        ) : (
          <AppText color="textMuted">Weigh in each morning for the clearest trend.</AppText>
        )}
        {lastMeasures.length ? (
          <View style={styles.measures}>
            {lastMeasures.map(({ m, row }) => (
              <View key={m.key} style={[styles.measure, { backgroundColor: c.surfaceHi }]}>
                <AppText variant="small" color="textMuted">
                  {m.label}
                </AppText>
                <AppText variant="bodyBold">{formatLength(Number(row![m.key]), units.length)}</AppText>
              </View>
            ))}
          </View>
        ) : null}
        <Button
          label="Measurements and trends"
          icon="body-outline"
          variant="secondary"
          onPress={() => router.push('/measurements')}
        />
      </Card>

      <SectionHeader title="Weekly volume" />
      <Card style={{ gap: Space.sm }}>
        <AppText variant="bodyBold">{formatVolume(weekVolumes[weekVolumes.length - 1], u)} this week</AppText>
        <BarChart values={weekVolumes.map((v) => weightNumber(v, u))} labels={weekLabels} color={c.accent} />
      </Card>

      <NumberSheet
        visible={logging}
        title="Today's weight"
        suffix={u}
        decimal
        initial={
          latest ? String(weightNumber(latest.weight_kg, u)) : profile.weight_kg ? String(weightNumber(profile.weight_kg, u)) : ''
        }
        onClose={() => setLogging(false)}
        onSave={async (typed) => {
          const n = toKg(typed, u);
          if (n < 30 || n > 300) throw new Error(`Enter a weight between ${formatWeight(30, u)} and ${formatWeight(300, u)}.`);
          saveBodyMetrics(profile.id, toDay(), { weight_kg: Math.round(n * 10) / 10 });
          await q.reload();
          await refreshStreaks();
        }}
      />
    </Screen>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
      <AppText variant="stat" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  icons: { flexDirection: 'row', gap: Space.xs },
  stats: { flexDirection: 'row', gap: Space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  measures: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  measure: { flexGrow: 1, flexBasis: '45%', padding: Space.sm, borderRadius: 12, gap: 2 },
});
