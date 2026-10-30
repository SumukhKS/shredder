import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Space, withAlpha } from '@/constants/theme';
import { dayLabel, formatDuration } from '@/lib/dates';
import { formatVolume, useUnits } from '@/lib/units';
import { describeSet, summarizeSets, type ExerciseLog } from '@/lib/workouts';
import type { WorkoutSummary } from '@/types/db';

import { ExerciseDemo } from './exercise-demo';
import { MuscleMap } from './muscle-map';
import { PrBadge } from './pr-badge';
import { IconButton } from './ui/button';
import { Card } from './ui/card';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

/** A finished workout: its title, then every exercise with the sets and reps done. */
export function WorkoutCard({
  workout,
  exercises,
  onPress,
  limit,
  showDay = false,
}: {
  workout: WorkoutSummary;
  exercises?: ExerciseLog[];
  onPress?: () => void;
  /** Show at most this many exercises, then "+N more". */
  limit?: number;
  showDay?: boolean;
}) {
  const c = useColors();
  const list = exercises ?? [];
  const shown = limit ? list.slice(0, limit) : list;
  const more = list.length - shown.length;

  return (
    <Card onPress={onPress} style={{ gap: Space.md }}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="h3" numberOfLines={2}>
            {workout.name}
          </AppText>
          <AppText variant="small" color="textMuted">
            {[showDay ? dayLabel(workout.day) : null, timeOf(workout.started_at), formatDuration(workout.duration_s)]
              .filter(Boolean)
              .join(', ')}
          </AppText>
        </View>
        {workout.pr_count > 0 ? (
          <View style={[styles.pr, { backgroundColor: c.surfaceHi, borderColor: withAlpha(c.carbs, 0.5) }]}>
            <PrBadge size={16} label="" />
            <AppText variant="smallBold" style={{ fontSize: 11 }}>
              {workout.pr_count} PR{workout.pr_count > 1 ? 's' : ''}
            </AppText>
          </View>
        ) : null}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={c.textMuted} /> : null}
      </View>
      <ExerciseList exercises={shown} more={more} />
    </Card>
  );
}

/** A finished workout in full: totals, then every exercise with each set on its own line. */
export function WorkoutDetailCard({
  workout,
  exercises,
  onOptions,
}: {
  workout: WorkoutSummary;
  exercises?: ExerciseLog[];
  /** Opens the three-dot menu (edit, repeat). */
  onOptions?: () => void;
}) {
  const c = useColors();
  const router = useRouter();
  const units = useUnits();
  return (
    <Card style={{ gap: Space.lg }}>
      <WorkoutHeader workout={workout} onOptions={onOptions} />
      <View style={[styles.stats, { borderColor: c.hairline }]}>
        <Stat label="Duration" value={formatDuration(workout.duration_s)} />
        <Stat label="Volume" value={formatVolume(Number(workout.total_volume), units.weight)} />
        <Stat label="Sets" value={String(workout.total_sets)} />
        <Stat label="PRs" value={String(workout.pr_count)} />
      </View>
      {exercises?.length ? <MuscleMap exercises={exercises} /> : null}
      {(exercises ?? []).map((e, i) => {
        let n = 0;
        return (
          <View key={i} style={{ gap: Space.xs }}>
            {/* Tapping the exercise opens its how-to page, the same one shown while logging. */}
            <Pressable
              disabled={!e.exercise_id}
              onPress={() => e.exercise_id && router.push({ pathname: '/exercise/[id]', params: { id: e.exercise_id } })}
              accessibilityRole="button"
              accessibilityLabel={`${e.name}, how to do it`}
              style={({ pressed }) => [styles.exercise, pressed && { opacity: 0.6 }]}>
              <ExerciseDemo gifId={e.gif_id} still round style={styles.icon} />
              <View style={{ flex: 1 }}>
                <AppText variant="h3" color="primary">
                  {e.name}
                </AppText>
                {e.notes ? (
                  <AppText variant="small" color="textMuted">
                    {e.notes}
                  </AppText>
                ) : null}
              </View>
              {e.exercise_id ? <Ionicons name="information-circle-outline" size={20} color={c.textMuted} /> : null}
            </Pressable>
            {e.sets.map((s, j) => {
              const warmup = s.set_type === 'warmup';
              if (!warmup) n += 1;
              return (
                <View key={j} style={styles.set}>
                  <AppText variant="bodyBold" color="textMuted" style={{ width: 24 }}>
                    {warmup ? 'W' : n}
                  </AppText>
                  <AppText variant="body">{describeSet(e.kind, s, units.weight)}</AppText>
                  {s.is_pr ? <PrBadge size={22} /> : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </Card>
  );
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The workout's name, with the date and time it was logged underneath. */
export function WorkoutHeader({
  workout,
  onOptions,
}: {
  workout: Pick<WorkoutSummary, 'name' | 'day' | 'started_at'>;
  onOptions?: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="h2" numberOfLines={2}>
          {workout.name}
        </AppText>
        <AppText variant="small" color="textMuted">
          {[dayLabel(workout.day), workout.started_at ? timeOf(workout.started_at) : null].filter(Boolean).join(', ')}
        </AppText>
      </View>
      {onOptions ? <IconButton icon="ellipsis-vertical" label="Workout options" onPress={onOptions} /> : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <AppText variant="bodyBold" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

/** Exercise names, each with its working sets in a line ("3 × 8 @ 80 kg"). */
export function ExerciseList({ exercises, more = 0 }: { exercises: ExerciseLog[]; more?: number }) {
  const units = useUnits();
  if (!exercises.length) return null;
  return (
    <View style={styles.list}>
      {exercises.map((e, i) => (
        <View key={i} style={styles.exercise}>
          <ExerciseDemo gifId={e.gif_id} still round style={styles.icon} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold" numberOfLines={1}>
              {e.name}
            </AppText>
            <AppText variant="small" color="textMuted" numberOfLines={1}>
              {summarizeSets(e.kind, e.sets, units.weight)}
            </AppText>
          </View>
        </View>
      ))}
      {more > 0 ? (
        <AppText variant="small" color="textMuted" style={{ marginLeft: ICON + Space.md }}>
          +{more} more
        </AppText>
      ) : null}
    </View>
  );
}

const ICON = 36;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  list: { gap: Space.sm },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  icon: { width: ICON, height: ICON },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: Space.md },
  set: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingLeft: ICON + Space.md },
  pr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.chip,
    borderWidth: 1,
  },
});
