import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { MenuSheet } from '@/components/menu-sheet';
import { SwipeDays } from '@/components/swipe-days';
import { WorkoutDetailCard } from '@/components/workout-card';
import { Card } from '@/components/ui/card';
import { DayHeading, LoadError, EmptyState, Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { fetchWorkoutExercises } from '@/lib/workouts';
import { completedSetCount, useWorkout } from '@/stores/workout';
import type { Exercise, WorkoutSummary } from '@/types/db';

/** Everything done on the chosen day, set by set. */
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

  const startWith = useWorkout((s) => s.startWith);
  const [menuFor, setMenuFor] = useState<WorkoutSummary | null>(null);

  function repeat(w: WorkoutSummary) {
    if (active) {
      return Alert.alert('Workout in progress', 'Finish or discard your current workout first.', [
        { text: 'Resume it', onPress: () => router.push('/workout/active') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
    startWith(
      w.name,
      (q.data?.exercises[w.id] ?? [])
        .filter((e) => e.exercise_id)
        .map((e) => ({
          exercise: {
            id: e.exercise_id,
            name: e.name,
            kind: e.kind,
            gif_id: e.gif_id ?? null,
            primary_muscle: e.primary_muscle ?? 'other',
            secondary_muscles: e.secondary_muscles ?? [],
          } as Exercise,
          sets: e.sets.filter((s) => s.set_type !== 'warmup').length,
        }))
    );
    router.push('/workout/active');
  }

  const workouts = q.data?.workouts ?? [];
  const live = active && day === toDay() ? active : null;

  return (
    <Screen padTop={false} refreshing={q.refreshing} onRefresh={q.refresh}>
      <LoadError q={q} what="this day" />
      <DayHeading day={day} />
      <SwipeDays day={day} onChange={setDay}>
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
            <WorkoutDetailCard workout={w} exercises={q.data?.exercises[w.id]} onOptions={() => setMenuFor(w)} />
          </Animated.View>
        ))}

        {q.data && workouts.length === 0 && !live ? (
          <EmptyState title="No workout logged" body="Workouts you finish on this day show up here." />
        ) : null}
        <MenuSheet
          visible={!!menuFor}
          title={menuFor?.name}
          onClose={() => setMenuFor(null)}
          options={
            menuFor
              ? [
                  {
                    label: 'Edit workout',
                    icon: 'create-outline',
                    onPress: () => router.push({ pathname: '/workout/edit', params: { id: menuFor.id } }),
                  },
                  { label: 'Repeat this workout', icon: 'repeat', onPress: () => repeat(menuFor) },
                  {
                    label: 'Open workout',
                    icon: 'open-outline',
                    onPress: () => router.push({ pathname: '/workout/[id]', params: { id: menuFor.id } }),
                  },
                ]
              : []
          }
        />
      </SwipeDays>
    </Screen>
  );
}

const styles = StyleSheet.create({
  live: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
