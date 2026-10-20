import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { dayLabel, formatDuration } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { formatVolume } from '@/lib/workouts';
import type { ExerciseKind } from '@/types/db';

interface Detail {
  id: string;
  name: string;
  day: string;
  duration_s: number;
  total_volume: number;
  total_sets: number;
  xp_earned: number;
  workout_exercises: {
    id: string;
    position: number;
    notes: string | null;
    exercises: { name: string; kind: ExerciseKind };
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

function describe(kind: ExerciseKind, s: Detail['workout_exercises'][number]['workout_sets'][number]) {
  switch (kind) {
    case 'weight_reps':
      return `${Number(s.weight_kg ?? 0)} kg × ${s.reps}`;
    case 'bodyweight_reps':
      return s.weight_kg ? `+${Number(s.weight_kg)} kg × ${s.reps}` : `${s.reps} reps`;
    case 'duration':
      return formatDuration(s.duration_s ?? 0);
    case 'distance_time':
      return `${Number(s.distance_m ?? 0) / 1000} km in ${formatDuration(s.duration_s ?? 0)}`;
  }
}

export default function WorkoutDetail() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useQuery(async () => {
    const { data, error } = await supabase
      .from('workouts')
      .select(
        'id, name, day, duration_s, total_volume, total_sets, xp_earned, workout_exercises(id, position, notes, exercises(name, kind), workout_sets(id, position, set_type, weight_kg, reps, duration_s, distance_m, is_pr))'
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
    const msg = 'This removes the workout from your history. XP already earned stays.';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) go();
    } else {
      Alert.alert('Delete workout?', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: go },
      ]);
    }
  }

  if (!data) return <Screen padTop={false} />;
  const exercises = [...data.workout_exercises].sort((a, b) => a.position - b.position);

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: data.name }} />
      <View style={{ gap: 2 }}>
        <AppText variant="h1">{data.name}</AppText>
        <AppText color="textMuted">
          {dayLabel(data.day)}, {formatDuration(data.duration_s)}
        </AppText>
      </View>
      <View style={styles.row}>
        <Card style={styles.stat}>
          <AppText variant="small" color="textMuted">Volume</AppText>
          <AppText variant="stat">{formatVolume(Number(data.total_volume))}</AppText>
        </Card>
        <Card style={styles.stat}>
          <AppText variant="small" color="textMuted">Sets</AppText>
          <AppText variant="stat">{data.total_sets}</AppText>
        </Card>
        <Card style={styles.stat} bg={c.xpSoft}>
          <AppText variant="small" color="textMuted">Earned</AppText>
          <AppText variant="stat" color="xp">{data.xp_earned} XP</AppText>
        </Card>
      </View>

      {exercises.map((we) => (
        <Card key={we.id} tone="flat" style={{ gap: Space.sm }}>
          <AppText variant="h3" color="primary">{we.exercises.name}</AppText>
          {we.notes ? <AppText variant="small" color="textMuted">{we.notes}</AppText> : null}
          {[...we.workout_sets]
            .sort((a, b) => a.position - b.position)
            .map((s, i) => (
              <View key={s.id} style={styles.row}>
                <AppText variant="bodyBold" color="textMuted" style={{ width: 24 }}>
                  {s.set_type === 'warmup' ? 'W' : i + 1}
                </AppText>
                <AppText variant="body" style={{ flex: 1 }}>
                  {describe(we.exercises.kind, s)}
                </AppText>
                {s.is_pr ? <Ionicons name="trophy" size={16} color={c.carbs} accessibilityLabel="Personal record" /> : null}
              </View>
            ))}
        </Card>
      ))}

      <Button label="Delete workout" variant="danger" onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  stat: { flex: 1, gap: 2, padding: Space.md },
});
