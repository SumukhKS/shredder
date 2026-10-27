import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { SwipeDays } from '@/components/swipe-days';
import { WeekCalendar } from '@/components/week-calendar';
import { WorkoutDetailCard } from '@/components/workout-card';
import { Card } from '@/components/ui/card';
import { EmptyState, Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { formatDuration, toDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { fetchWorkoutExercises } from '@/lib/workouts';
import { completedSetCount, useWorkout } from '@/stores/workout';
import type { WorkoutSummary } from '@/types/db';

/** A week of training at a glance, then everything done on the chosen day, set by set. */
export default function TrainingDay() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState(params.day ?? toDay());
  const active = useWorkout((s) => s.active);
  const q = useQuery(async () => {
    const { data, error } = await supabase
      .from('workouts')
      .select('id, name, day, started_at, duration_s, total_volume, total_sets, pr_count')
      .eq('day', day)
      .order('started_at');
    if (error) throw error;
    const workouts = (data ?? []) as WorkoutSummary[];
    return { workouts, exercises: await fetchWorkoutExercises(workouts.map((w) => w.id)) };
  }, day);
  const [version, setVersion] = useState(0);

  const workouts = q.data?.workouts ?? [];
  const live = active && day === toDay() ? active : null;
  const time = workouts.reduce((t, w) => t + w.duration_s, 0);
  const exerciseCount = workouts.reduce((n, w) => n + (q.data?.exercises[w.id]?.length ?? 0), 0);

  return (
    <Screen
      padTop={false}
      refreshing={q.refreshing}
      onRefresh={() => {
        q.refresh();
        setVersion((v) => v + 1);
      }}>
      <WeekCalendar
        day={day}
        onChange={setDay}
        kind="workout"
        version={version}
        summary={(n, span) => `${n} training day${n === 1 ? '' : 's'} this ${span}`}
      />
      <SwipeDays day={day} onChange={setDay}>
        {workouts.length ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <Card tone="hero" style={styles.totals}>
              <Total label={workouts.length === 1 ? 'Workout' : 'Workouts'} value={String(workouts.length)} />
              <Total label={exerciseCount === 1 ? 'Exercise' : 'Exercises'} value={String(exerciseCount)} />
              <Total label="Time" value={formatDuration(time)} />
            </Card>
          </Animated.View>
        ) : null}

        {live ? (
          <Card onPress={() => router.push('/workout/active')} style={styles.live}>
            <Ionicons name="play" size={18} color={c.text} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold" numberOfLines={1}>
                {live.name}
              </AppText>
              <AppText variant="small" color="textMuted">
                In progress, {completedSetCount(live)} sets done
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
          </Card>
        ) : null}

        {workouts.map((w, i) => (
          <Animated.View key={w.id} entering={FadeInDown.delay(80 * (i + 1)).duration(400)}>
            <WorkoutDetailCard
              workout={w}
              exercises={q.data?.exercises[w.id]}
              onEdit={() => router.push({ pathname: '/workout/edit', params: { id: w.id } })}
              onOptions={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })}
            />
          </Animated.View>
        ))}

        {q.data && workouts.length === 0 && !live ? (
          <EmptyState title="No workout logged" body="Workouts you finish on this day show up here." />
        ) : null}
      </SwipeDays>
    </Screen>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <AppText variant="stat">{value}</AppText>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  totals: { flexDirection: 'row' },
  live: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
