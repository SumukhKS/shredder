import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View, type NativeScrollEvent } from 'react-native';

import { WorkoutCard } from '@/components/workout-card';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { useQuery } from '@/lib/use-query';
import { countWorkouts, fetchRecentWorkouts, fetchRoutines, fetchWorkoutExercises, type ExerciseLog } from '@/lib/workouts';
import { useWorkout } from '@/stores/workout';
import type { Routine, WorkoutSummary } from '@/types/db';

const PAGE = 20;

interface Page {
  workouts: WorkoutSummary[];
  exercises: Record<string, ExerciseLog[]>;
}

async function loadPage(offset: number): Promise<Page> {
  const workouts = await fetchRecentWorkouts(PAGE, offset);
  return { workouts, exercises: await fetchWorkoutExercises(workouts.map((w) => w.id)) };
}

const nearEnd = ({ layoutMeasurement, contentOffset, contentSize }: NativeScrollEvent) =>
  layoutMeasurement.height + contentOffset.y >= contentSize.height - 800;

export default function Train() {
  const router = useRouter();
  const active = useWorkout((s) => s.active);
  const start = useWorkout((s) => s.start);
  const routines = useQuery(fetchRoutines);
  // The whole history, a page at a time: the newest page reloads on focus, older pages load on scroll.
  const history = useQuery(async () => {
    const [page, total] = await Promise.all([loadPage(0), countWorkouts()]);
    return { ...page, total };
  });
  const [older, setOlder] = useState<Page>({ workouts: [], exercises: {} });
  const [loadingMore, setLoadingMore] = useState(false);
  const seen = new Set<string>();
  const workouts = [...(history.data?.workouts ?? []), ...older.workouts].filter((w) => !seen.has(w.id) && !!seen.add(w.id));
  const exercises = { ...older.exercises, ...history.data?.exercises };
  const total = history.data?.total ?? 0;
  const hasMore = !!history.data && workouts.length < total;

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await loadPage(workouts.length);
      setOlder((o) => ({ workouts: [...o.workouts, ...page.workouts], exercises: { ...o.exercises, ...page.exercises } }));
    } finally {
      setLoadingMore(false);
    }
  }

  async function startRoutine(routine?: Routine) {
    if (active) {
      const go = () => router.push('/workout/active');
      if (Platform.OS === 'web') return go();
      return Alert.alert('Workout in progress', 'Finish or discard your current workout first.', [
        { text: 'Resume it', onPress: go },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
    await start(routine);
    router.push('/workout/active');
  }

  return (
    <Screen
      title="Train"
      refreshing={routines.refreshing}
      onRefresh={() => {
        routines.refresh();
        setOlder({ workouts: [], exercises: {} });
        history.reload();
      }}
      scrollEventThrottle={200}
      onScroll={(e) => {
        if (nearEnd(e.nativeEvent)) loadMore();
      }}>
      <Button
        label={active ? 'Resume workout' : 'Start empty workout'}
        icon={active ? 'play' : 'add'}
        size="lg"
        onPress={() => (active ? router.push('/workout/active') : startRoutine())}
      />

      <SectionHeader
        title="Routines"
        action={<Button label="New" icon="add" size="sm" variant="secondary" onPress={() => router.push('/routine/edit')} />}
      />
      {routines.data && routines.data.length === 0 ? (
        <EmptyState
          title="No routines yet"
          body="Save your push, pull and leg days once, then start them in one tap."
          action={<Button label="Create a routine" variant="secondary" onPress={() => router.push('/routine/edit')} />}
        />
      ) : null}
      {routines.data?.map((r) => (
        <Card key={r.id} style={{ gap: Space.md }}>
          <View style={styles.row}>
            <AppText variant="h3" style={{ flex: 1 }} numberOfLines={1}>
              {r.name}
            </AppText>
            <IconButton
              icon="create-outline"
              label={`Edit ${r.name}`}
              onPress={() => router.push({ pathname: '/routine/edit', params: { id: r.id } })}
            />
          </View>
          <AppText variant="small" color="textMuted" numberOfLines={2}>
            {r.routine_exercises.map((re) => re.exercises.name).join(', ') || 'No exercises'}
          </AppText>
          <Button label="Start routine" icon="play" onPress={() => startRoutine(r)} />
        </Card>
      ))}

      <SectionHeader
        title="History"
        action={
          total ? (
            <AppText variant="smallBold" color="textMuted">
              {total} workout{total === 1 ? '' : 's'}
            </AppText>
          ) : null
        }
      />
      {history.data && workouts.length === 0 ? (
        <EmptyState title="Your first workout goes here" body="Finish a workout to see volume and PRs." />
      ) : null}
      {workouts.map((w) => (
        <WorkoutCard
          key={w.id}
          workout={w}
          exercises={exercises[w.id]}
          limit={3}
          showDay
          onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })}
        />
      ))}
      {hasMore ? (
        <Button
          label={loadingMore ? 'Loading older workouts' : `Show older workouts (${total - workouts.length} more)`}
          variant="ghost"
          loading={loadingMore}
          onPress={loadMore}
        />
      ) : workouts.length > PAGE ? (
        <AppText variant="small" color="textMuted" align="center">
          That&apos;s every workout you&apos;ve logged.
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
