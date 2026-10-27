import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BarChart, LineChart } from '@/components/charts';
import { NumberSheet } from '@/components/number-sheet';
import { PrBadge } from '@/components/pr-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { addDays, fromDay, mondayOf, toDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { formatVolume } from '@/lib/workouts';
import { fetchWorkoutWeeks, refreshStreaks, weekStreaks } from '@/lib/streak';
import { useSession } from '@/stores/session';

interface ProgressData {
  weights: { day: string; weight_kg: number }[];
  weeks: { week: string; volume: number; workouts: number }[];
  prs: { best_e1rm: number; best_weight: number; reps: number; achieved_at: string; exercises: { name: string } }[];
  workoutCount: number;
  bestWeekStreak: number;
}

async function load(): Promise<ProgressData> {
  const since = addDays(toDay(), -7 * 8);
  const [w, v, p, n, weeks] = await Promise.all([
    supabase.from('body_metrics').select('day, weight_kg').order('day', { ascending: false }).limit(60),
    supabase.from('weekly_volume').select('week, volume, workouts').gte('week', mondayOf(since)).order('week'),
    supabase
      .from('personal_records')
      .select('best_e1rm, best_weight, reps, achieved_at, exercises(name)')
      .order('best_e1rm', { ascending: false })
      .limit(8),
    supabase.from('workouts').select('id', { count: 'exact', head: true }),
    fetchWorkoutWeeks(),
  ]);
  return {
    weights: ((w.data ?? []) as ProgressData['weights']).reverse(),
    weeks: (v.data ?? []) as ProgressData['weeks'],
    prs: (p.data ?? []) as unknown as ProgressData['prs'],
    workoutCount: n.count ?? 0,
    bestWeekStreak: weekStreaks(weeks).best,
  };
}

export default function Progress() {
  const c = useColors();
  const profile = useSession((s) => s.profile);
  const q = useQuery(load);
  const [logging, setLogging] = useState(false);

  if (!profile) return null;
  const d = q.data;

  // Fill the last 8 weeks so empty weeks show as zero bars
  const thisWeek = mondayOf(toDay());
  const weekKeys = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, -7 * (7 - i)));
  const volumeByWeek = new Map((d?.weeks ?? []).map((x) => [x.week, Number(x.volume)]));
  const weekVolumes = weekKeys.map((k) => volumeByWeek.get(k) ?? 0);
  // Day of month under each bar; the month name only where it changes
  const weekLabels = weekKeys.map((k, i) => {
    const date = fromDay(k);
    const month = date.toLocaleDateString(undefined, { month: 'short' });
    const newMonth = i === 0 || fromDay(weekKeys[i - 1]).getMonth() !== date.getMonth();
    return newMonth ? `${month} ${date.getDate()}` : String(date.getDate());
  });

  const weights = d?.weights ?? [];
  const latest = weights[weights.length - 1];
  const first = weights[0];
  const change = latest && first ? Number(latest.weight_kg) - Number(first.weight_kg) : 0;

  return (
    <Screen title="Progress" refreshing={q.refreshing} onRefresh={q.refresh}>
      <View style={styles.stats}>
        <Stat label="Workouts" value={String(d?.workoutCount ?? 0)} />
        <Stat label="Best streak" value={`${profile.longest_streak} d`} />
        <Stat label="Best weeks" value={`${d?.bestWeekStreak ?? 0} wk`} />
      </View>

      <SectionHeader
        title="Body weight"
        action={<Button label="Log" icon="add" size="sm" variant="secondary" onPress={() => setLogging(true)} />}
      />
      <Card style={{ gap: Space.md }}>
        {weights.length ? (
          <>
            <View style={styles.row}>
              <AppText variant="hero">{Number(latest.weight_kg)}</AppText>
              <AppText variant="h3" color="textMuted">kg</AppText>
              <View style={{ flex: 1 }} />
              {weights.length > 1 ? (
                <AppText variant="bodyBold" color={change <= 0 ? 'success' : 'accent'}>
                  {change > 0 ? '+' : ''}
                  {change.toFixed(1)} kg since {fromDay(first.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </AppText>
              ) : null}
            </View>
            {weights.length > 1 ? (
              <LineChart
                values={weights.map((x) => Number(x.weight_kg))}
                labels={weights.map((x) => fromDay(x.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}
                color={c.primary}
              />
            ) : (
              <AppText variant="small" color="textMuted">Log again on another day to see your trend.</AppText>
            )}
          </>
        ) : (
          <AppText color="textMuted">Weigh in each morning for the clearest trend.</AppText>
        )}
      </Card>

      <SectionHeader title="Weekly volume" />
      <Card style={{ gap: Space.sm }}>
        <AppText variant="bodyBold">
          {formatVolume(weekVolumes[weekVolumes.length - 1])} this week
        </AppText>
        <BarChart values={weekVolumes} labels={weekLabels} color={c.accent} />
      </Card>

      <SectionHeader title="Personal records" />
      {d && d.prs.length === 0 ? (
        <EmptyState title="No records yet" body="Your best estimated one-rep max for each lift appears here after your first workout." />
      ) : (
        <Card tone="flat" style={{ gap: Space.md }}>
          {d?.prs.map((p) => (
            <View key={p.exercises.name} style={styles.row}>
              <PrBadge size={26} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{p.exercises.name}</AppText>
                <AppText variant="small" color="textMuted">
                  {Number(p.best_weight)} kg × {p.reps}
                </AppText>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <AppText variant="h3">{Number(p.best_e1rm)} kg</AppText>
                <AppText variant="small" color="textMuted">est. 1RM</AppText>
              </View>
            </View>
          ))}
        </Card>
      )}

      <NumberSheet
        visible={logging}
        title="Today's weight"
        suffix="kg"
        decimal
        initial={latest ? String(Number(latest.weight_kg)) : profile.weight_kg ? String(profile.weight_kg) : ''}
        onClose={() => setLogging(false)}
        onSave={async (n) => {
          if (n < 30 || n > 300) throw new Error('Enter a weight between 30 and 300 kg.');
          const { error } = await supabase
            .from('body_metrics')
            .upsert({ user_id: profile.id, day: toDay(), weight_kg: Math.round(n * 10) / 10 }, { onConflict: 'user_id,day' });
          if (error) throw error;
          await q.reload();
          await refreshStreaks();
        }}
      />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, padding: Space.md, gap: 2 }}>
      <AppText variant="small" color="textMuted">{label}</AppText>
      <AppText variant="stat" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: Space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
});
