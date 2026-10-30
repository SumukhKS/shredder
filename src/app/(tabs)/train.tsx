import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseInfoButton, ExerciseList } from '@/components/exercise-list';
import { WorkoutCard } from '@/components/workout-card';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { EmptyState, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { pendingWorkouts } from '@/lib/outbox';
import { useQuery } from '@/lib/use-query';
import {
  countWorkouts,
  fetchRecentWorkouts,
  fetchRoutines,
  fetchWorkoutExercises,
  type ExerciseLog,
  routinesWithWaiting,
} from '@/lib/workouts';
import { useWorkout } from '@/stores/workout';
import type { Routine, WorkoutSummary } from '@/types/db';

const PAGE = 20;
const LIST_BOTTOM = 120;

type Category = 'routines' | 'history' | 'exercises';

interface Page {
  workouts: WorkoutSummary[];
  exercises: Record<string, ExerciseLog[]>;
}

const sortedWaiting = (workouts: WorkoutSummary[]) =>
  [...pendingWorkouts(workouts)].sort((a, b) => b.started_at.localeCompare(a.started_at));

async function loadPage(offset: number): Promise<Page> {
  const workouts = await fetchRecentWorkouts(PAGE, offset);
  return { workouts, exercises: await fetchWorkoutExercises(workouts.map((w) => w.id)) };
}

export default function Train() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<Category>('routines');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + Space.lg }}>
      <View style={styles.head}>
        <AppText variant="h1">Train</AppText>
        <Segmented<Category>
          options={[
            { key: 'routines', label: 'Routines' },
            { key: 'history', label: 'History' },
            { key: 'exercises', label: 'Exercises' },
          ]}
          value={category}
          onChange={setCategory}
        />
      </View>
      {/* Each category loads only when it's opened. */}
      {category === 'routines' ? <Routines /> : null}
      {category === 'history' ? <History /> : null}
      {category === 'exercises' ? <Exercises /> : null}
    </View>
  );
}

function Routines() {
  const c = useColors();
  const router = useRouter();
  const active = useWorkout((s) => s.active);
  const start = useWorkout((s) => s.start);
  const routines = useQuery(fetchRoutines, '', { cache: 'routines', overlay: routinesWithWaiting });

  function startRoutine(routine?: Routine) {
    if (active) {
      const go = () => router.push('/workout/active');
      if (Platform.OS === 'web') return go();
      return Alert.alert('Workout in progress', 'Finish or discard your current workout first.', [
        { text: 'Resume it', onPress: go },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
    start(routine);
    router.push('/workout/active');
  }

  return (
    <FlatList
      data={routines.data ?? []}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={routines.refreshing}
          onRefresh={routines.refresh}
          tintColor={c.primary}
          colors={[c.primary]}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: Space.lg }}>
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
        </View>
      }
      ListEmptyComponent={
        routines.data ? (
          <EmptyState
            title="No routines yet"
            body="Save your push, pull and leg days once, then start them in one tap."
            action={<Button label="Create a routine" variant="secondary" onPress={() => router.push('/routine/edit')} />}
          />
        ) : routines.error ? (
          <EmptyState
            title="Couldn't load your routines"
            body={routines.error}
            action={<Button label="Try again" variant="secondary" icon="refresh" onPress={routines.reload} />}
          />
        ) : undefined
      }
      renderItem={({ item: r }) => (
        <Card style={{ gap: Space.md }}>
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
            {r.routine_exercises.map((re) => re.exercises?.name).join(', ') || 'No exercises'}
          </AppText>
          <Button label="Start routine" icon="play" onPress={() => startRoutine(r)} />
        </Card>
      )}
    />
  );
}

function History() {
  const c = useColors();
  const router = useRouter();
  // The whole history, a page at a time: the newest page reloads on focus, older pages load on scroll.
  const history = useQuery(
    async () => {
      const [page, total] = await Promise.all([loadPage(0), countWorkouts()]);
      return { ...page, total };
    },
    '',
    { cache: 'history', overlay: (h) => ({ ...h, workouts: sortedWaiting(h.workouts) }) }
  );
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
    } catch {
      // Stays on the button below, which can be tapped to try again.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <FlatList
      data={workouts}
      keyExtractor={(w) => w.id}
      contentContainerStyle={styles.list}
      initialNumToRender={6}
      windowSize={7}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
      refreshControl={
        <RefreshControl
          refreshing={history.refreshing}
          onRefresh={() => {
            setOlder({ workouts: [], exercises: {} });
            history.refresh();
          }}
          tintColor={c.primary}
          colors={[c.primary]}
        />
      }
      ListHeaderComponent={
        total ? (
          <AppText variant="smallBold" color="textMuted">
            {total.toLocaleString()} workout{total === 1 ? '' : 's'}
          </AppText>
        ) : undefined
      }
      ListEmptyComponent={
        history.data ? (
          <EmptyState title="Your first workout goes here" body="Finish a workout to see volume and PRs." />
        ) : history.error ? (
          <EmptyState
            title="Couldn't load your history"
            body={history.error}
            action={<Button label="Try again" variant="secondary" icon="refresh" onPress={history.reload} />}
          />
        ) : undefined
      }
      renderItem={({ item: w }) => (
        <WorkoutCard
          workout={w}
          exercises={exercises[w.id]}
          limit={3}
          showDay
          onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })}
        />
      )}
      ListFooterComponent={
        hasMore ? (
          <Button
            label={
              loadingMore ? 'Loading older workouts' : `Show older workouts (${(total - workouts.length).toLocaleString()} more)`
            }
            variant="ghost"
            loading={loadingMore}
            onPress={loadMore}
          />
        ) : workouts.length > PAGE ? (
          <AppText variant="small" color="textMuted" align="center">
            That&apos;s every workout you&apos;ve logged.
          </AppText>
        ) : undefined
      }
    />
  );
}

function Exercises() {
  const router = useRouter();
  return (
    <ExerciseList
      bottomPadding={LIST_BOTTOM}
      onPress={(e) => router.push({ pathname: '/exercise/[id]', params: { id: e.id } })}
      trailing={(e) => <ExerciseInfoButton exercise={e} />}
    />
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: Space.lg, paddingBottom: Space.md, gap: Space.md },
  list: { padding: Space.lg, paddingTop: Space.sm, gap: Space.lg, paddingBottom: LIST_BOTTOM },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
