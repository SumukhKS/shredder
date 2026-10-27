import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ExerciseDemo } from '@/components/exercise-demo';
import { WorkoutHeader } from '@/components/workout-card';
import { MenuSheet } from '@/components/menu-sheet';
import { MuscleMap } from '@/components/muscle-map';
import { PrBadge } from '@/components/pr-badge';
import { TextSheet } from '@/components/number-sheet';
import { IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { describeSet, formatVolume } from '@/lib/workouts';
import { useWorkout } from '@/stores/workout';
import type { Exercise } from '@/types/db';

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
    workout_sets: {
      id: string;
      position: number;
      set_type: string;
      weight_kg: number | null;
      reps: number | null;
      duration_s: number | null;
      distance_m: number | null;
      is_pr: boolean;
    }[];
  }[];
}

export default function WorkoutDetail() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const active = useWorkout((s) => s.active);
  const startWith = useWorkout((s) => s.startWith);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { data, reload } = useQuery(async () => {
    const { data, error } = await supabase
      .from('workouts')
      .select(
        'id, name, day, started_at, duration_s, total_volume, total_sets, workout_exercises(id, position, notes, exercises(*), workout_sets(id, position, set_type, weight_kg, reps, duration_s, distance_m, is_pr))'
      )
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as unknown as Detail;
  }, id);

  function remove() {
    const go = async () => {
      await supabase.from('workouts').delete().eq('id', id);
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
    const { error } = await supabase.from('workouts').update({ name }).eq('id', id);
    if (error) throw error;
    await reload();
  }

  async function repeat(exercises: Detail['workout_exercises']) {
    if (active) {
      const go = () => router.push('/workout/active');
      if (Platform.OS === 'web') return go();
      return Alert.alert('Workout in progress', 'Finish or discard your current workout first.', [
        { text: 'Resume it', onPress: go },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
    await startWith(
      data!.name,
      exercises.map((we) => ({ exercise: we.exercises, sets: we.workout_sets.filter((s) => s.set_type !== 'warmup').length }))
    );
    router.push('/workout/active');
  }

  const edit = () => router.push({ pathname: '/workout/edit', params: { id } });

  if (!data) return <Screen padTop={false} />;
  const exercises = [...data.workout_exercises].sort((a, b) => a.position - b.position);
  const prCount = exercises.reduce((n, we) => n + we.workout_sets.filter((s) => s.is_pr).length, 0);

  return (
    <Screen padTop={false}>
      <Stack.Screen
        options={{
          title: data.name,
          headerRight: () => <IconButton icon="ellipsis-vertical" label="Workout options" onPress={() => setMenu(true)} />,
        }}
      />
      <WorkoutHeader workout={data} onEdit={edit} />
      <View style={styles.row}>
        <Card style={styles.stat}>
          <AppText variant="small" color="textMuted">
            Volume
          </AppText>
          <AppText variant="stat">{formatVolume(Number(data.total_volume))}</AppText>
        </Card>
        <Card style={styles.stat}>
          <AppText variant="small" color="textMuted">
            Sets
          </AppText>
          <AppText variant="stat">{data.total_sets}</AppText>
        </Card>
        <Card style={styles.stat}>
          <AppText variant="small" color="textMuted">
            PRs
          </AppText>
          <AppText variant="stat">{prCount}</AppText>
        </Card>
      </View>

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

      {exercises.map((we) => (
        <Card key={we.id} tone="flat" style={{ gap: Space.sm }}>
          <Pressable
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: we.exercises.id } })}
            accessibilityRole="button"
            accessibilityLabel={`${we.exercises.name}, how to do it`}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
            <ExerciseDemo gifId={we.exercises.gif_id} still round style={styles.icon} />
            <AppText variant="h3" color="primary" style={{ flex: 1 }}>
              {we.exercises.name}
            </AppText>
            <Ionicons name="information-circle-outline" size={20} color={c.textMuted} />
          </Pressable>
          {we.notes ? (
            <AppText variant="small" color="textMuted">
              {we.notes}
            </AppText>
          ) : null}
          {[...we.workout_sets]
            .sort((a, b) => a.position - b.position)
            .map((s, i) => (
              <View key={s.id} style={styles.row}>
                <AppText variant="bodyBold" color="textMuted" style={{ width: 24 }}>
                  {s.set_type === 'warmup' ? 'W' : i + 1}
                </AppText>
                <AppText variant="body">{describeSet(we.exercises.kind, s)}</AppText>
                {s.is_pr ? <PrBadge size={22} /> : null}
              </View>
            ))}
        </Card>
      ))}

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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  icon: { width: 36, height: 36 },
  stat: { flex: 1, gap: 2, padding: Space.md },
});
