import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { dayLabel, formatDuration } from '@/lib/dates';
import { useQuery } from '@/lib/use-query';
import { fetchRecentWorkouts, fetchRoutines, formatVolume } from '@/lib/workouts';
import { useWorkout } from '@/stores/workout';
import type { Routine } from '@/types/db';

export default function Train() {
  const c = useColors();
  const router = useRouter();
  const active = useWorkout((s) => s.active);
  const start = useWorkout((s) => s.start);
  const routines = useQuery(fetchRoutines);
  const history = useQuery(() => fetchRecentWorkouts(15));

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
        history.reload();
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

      <SectionHeader title="History" />
      {history.data && history.data.length === 0 ? (
        <EmptyState title="Your first workout goes here" body="Finish a workout to see volume, PRs and XP." />
      ) : null}
      {history.data?.map((w) => (
        <Card key={w.id} tone="flat" onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })}>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyBold" numberOfLines={1}>
                {w.name}
              </AppText>
              <AppText variant="small" color="textMuted">
                {dayLabel(w.day)}, {formatDuration(w.duration_s)}
              </AppText>
            </View>
            <AppText variant="smallBold" color="xp">
              +{w.xp_earned} XP
            </AppText>
          </View>
          <View style={[styles.row, { marginTop: Space.md }]}>
            <Stat icon="layers-outline" text={`${w.total_sets} sets`} />
            <Stat icon="barbell-outline" text={formatVolume(Number(w.total_volume))} />
            {w.pr_count > 0 ? <Stat icon="trophy" text={`${w.pr_count} PR${w.pr_count > 1 ? 's' : ''}`} color={c.carbs} /> : null}
          </View>
        </Card>
      ))}
    </Screen>
  );
}

function Stat({ icon, text, color }: { icon: keyof typeof Ionicons.glyphMap; text: string; color?: string }) {
  const c = useColors();
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={14} color={color ?? c.textMuted} />
      <AppText variant="smallBold" color="textMuted">
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
