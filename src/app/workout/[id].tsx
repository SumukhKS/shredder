import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ExerciseDemo } from '@/components/exercise-demo';
import { MenuSheet } from '@/components/menu-sheet';
import { MuscleMap } from '@/components/muscle-map';
import { TextSheet } from '@/components/number-sheet';
import { PrBadge } from '@/components/pr-badge';
import { WorkoutHeader } from '@/components/workout-card';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space, withAlpha } from '@/constants/theme';
import { formatDuration } from '@/lib/dates';
import { sessionValue } from '@/lib/history-stats';
import { enqueue, isWaitingWorkout } from '@/lib/outbox';
import { supabase } from '@/lib/supabase';
import { formatVolume, useUnits, weightNumber } from '@/lib/units';
import { useQuery } from '@/lib/use-query';
import { describeSet, MUSCLE_LABELS } from '@/lib/workouts';
import { useWorkout } from '@/stores/workout';
import type { Exercise } from '@/types/db';

interface DetailSet {
  id: string;
  position: number;
  set_type: string;
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  is_pr: boolean;
}

interface Detail {
  id: string;
  name: string;
  day: string;
  started_at: string;
  duration_s: number;
  total_volume: number;
  total_sets: number;
  workout_exercises: {
    id: string;
    position: number;
    notes: string | null;
    exercises: Exercise;
    workout_sets: DetailSet[];
  }[];
}

async function loadWorkout(id: string): Promise<Detail> {
  const { data, error } = await supabase
    .from('workouts')
    .select(
      'id, name, day, started_at, duration_s, total_volume, total_sets, workout_exercises(id, position, notes, exercises(id, name, kind, gif_id, primary_muscle, secondary_muscles, equipment, created_by), workout_sets(id, position, set_type, weight_kg, reps, duration_s, distance_m, is_pr))'
    )
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as Detail;
}

const TYPE_LETTER: Record<string, string> = { warmup: 'W', drop: 'D', failure: 'F' };

export default function WorkoutDetail() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const units = useUnits();
  const active = useWorkout((s) => s.active);
  const startWith = useWorkout((s) => s.startWith);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { data, error, reload } = useQuery(() => loadWorkout(id), id, { cache: 'workout' });

  function remove() {
    const go = () => {
      enqueue({ kind: 'delete', table: 'workouts', match: { id } });
      router.back();
    };
    const msg = 'This removes the workout and its sets from your history.';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) go();
    } else {
      Alert.alert('Delete workout?', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: go },
      ]);
    }
  }

  async function rename(name: string) {
    enqueue({ kind: 'update', table: 'workouts', values: { name }, match: { id } });
    await reload();
  }

  function repeat(exercises: Detail['workout_exercises']) {
    if (active) {
      const go = () => router.push('/workout/active');
      if (Platform.OS === 'web') return go();
      return Alert.alert('Workout in progress', 'Finish or discard your current workout first.', [
        { text: 'Resume it', onPress: go },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
    startWith(
      data!.name,
      exercises.map((we) => ({ exercise: we.exercises, sets: we.workout_sets.filter((s) => s.set_type !== 'warmup').length }))
    );
    router.push('/workout/active');
  }

  const edit = () => router.push({ pathname: '/workout/edit', params: { id } });

  if (!data) {
    return (
      <Screen padTop={false}>
        {isWaitingWorkout(id) ? (
          <AppText color="textMuted" align="center" style={{ paddingTop: Space.xl }}>
            This workout is saved on your phone. Its details will show here once it has synced.
          </AppText>
        ) : error ? (
          <View style={{ gap: Space.md, alignItems: 'center', paddingTop: Space.xl }}>
            <AppText color="textMuted" align="center">
              Couldn&apos;t load this workout. {error}
            </AppText>
            <Button label="Try again" variant="secondary" icon="refresh" onPress={reload} />
          </View>
        ) : (
          <ActivityIndicator color={c.primary} style={{ paddingTop: Space.xl }} />
        )}
      </Screen>
    );
  }
  const exercises = [...data.workout_exercises].sort((a, b) => a.position - b.position);
  const prCount = exercises.reduce((n, we) => n + we.workout_sets.filter((s) => s.is_pr).length, 0);

  return (
    <Screen padTop={false}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => <IconButton icon="ellipsis-vertical" label="Workout options" onPress={() => setMenu(true)} />,
        }}
      />
      <WorkoutHeader workout={data} />

      <Card style={styles.strip}>
        <Stat icon="stopwatch-outline" label="Duration" value={formatDuration(data.duration_s)} />
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Stat icon="barbell-outline" label="Volume" value={formatVolume(Number(data.total_volume), units.weight)} />
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Stat icon="layers-outline" label="Sets" value={String(data.total_sets)} />
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Stat icon="trophy-outline" label="PRs" value={String(prCount)} />
      </Card>

      <SectionHeader title="Muscles worked" />
      <Card>
        <MuscleMap
          exercises={exercises.map((we) => ({
            name: we.exercises.name,
            primary_muscle: we.exercises.primary_muscle,
            secondary_muscles: we.exercises.secondary_muscles,
            sets: we.workout_sets,
          }))}
        />
      </Card>

      <SectionHeader title={`${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`} />
      {exercises.map((we) => {
        const sets = [...we.workout_sets].sort((a, b) => a.position - b.position);
        const weighted = we.exercises.kind === 'weight_reps';
        let n = 0;
        return (
          <Card key={we.id} tone="flat" style={{ gap: Space.md }}>
            <Pressable
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: we.exercises.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${we.exercises.name}, progress and how to do it`}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
              <ExerciseDemo gifId={we.exercises.gif_id} still round style={styles.icon} />
              <View style={{ flex: 1 }}>
                <AppText variant="h3" numberOfLines={2}>
                  {we.exercises.name}
                </AppText>
                <AppText variant="small" color="textMuted">
                  {MUSCLE_LABELS[we.exercises.primary_muscle] ?? we.exercises.primary_muscle}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
            </Pressable>
            {we.notes ? (
              <AppText variant="small" color="textMuted">
                {we.notes}
              </AppText>
            ) : null}

            <View style={[styles.table, { borderColor: c.hairline }]}>
              <View style={[styles.tr, { backgroundColor: c.surfaceHi }]}>
                <AppText variant="smallBold" color="textMuted" style={styles.colSet}>
                  SET
                </AppText>
                <AppText variant="smallBold" color="textMuted" style={{ flex: 1 }}>
                  {weighted ? `${units.weight.toUpperCase()} × REPS` : 'DONE'}
                </AppText>
                {weighted ? (
                  <AppText variant="smallBold" color="textMuted" style={styles.colRm}>
                    EST. 1RM
                  </AppText>
                ) : null}
              </View>
              {sets.map((s, i) => {
                const warmup = s.set_type === 'warmup';
                if (!warmup) n += 1;
                const rm = weighted && !warmup ? sessionValue('e1rm', [s]) : null;
                return (
                  <View
                    key={s.id}
                    style={[
                      styles.tr,
                      i % 2 === 1 && { backgroundColor: withAlpha(c.surfaceHi, 0.5) },
                      s.is_pr && { backgroundColor: withAlpha(c.primary, 0.1) },
                    ]}>
                    <AppText variant="bodyBold" color={warmup ? 'textMuted' : 'primary'} style={styles.colSet}>
                      {TYPE_LETTER[s.set_type] ?? n}
                    </AppText>
                    <AppText variant="body" color={warmup ? 'textMuted' : 'text'} style={{ flex: 1 }}>
                      {describeSet(we.exercises.kind, s, units.weight)}
                    </AppText>
                    {s.is_pr ? <PrBadge size={20} /> : null}
                    {weighted ? (
                      <AppText variant="small" color="textMuted" style={styles.colRm}>
                        {rm ? weightNumber(rm, units.weight) : '-'}
                      </AppText>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </Card>
        );
      })}

      <MenuSheet
        visible={menu}
        title={data.name}
        onClose={() => setMenu(false)}
        options={[
          { label: 'Edit workout', icon: 'create-outline', onPress: edit },
          { label: 'Rename', icon: 'text-outline', onPress: () => setRenaming(true) },
          { label: 'Repeat this workout', icon: 'repeat', onPress: () => repeat(exercises) },
          { label: 'Delete workout', icon: 'trash-outline', destructive: true, onPress: remove },
        ]}
      />
      <TextSheet
        visible={renaming}
        title="Rename workout"
        initial={data.name}
        onClose={() => setRenaming(false)}
        onSave={rename}
      />
    </Screen>
  );
}

function Stat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const c = useColors();
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={c.primary} />
      <AppText variant="bodyBold" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      <AppText variant="small" color="textMuted" style={{ fontSize: 11 }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  icon: { width: 44, height: 44 },
  strip: { flexDirection: 'row', alignItems: 'center', paddingVertical: Space.md, paddingHorizontal: Space.sm },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  divider: { width: 1, alignSelf: 'stretch' },
  table: { borderWidth: 1, borderRadius: Radius.row, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: 8, paddingHorizontal: Space.md },
  colSet: { width: 32 },
  colRm: { width: 64, textAlign: 'right' },
});
