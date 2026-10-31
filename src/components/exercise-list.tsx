import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ExerciseDemo } from '@/components/exercise-demo';
import { Button, IconButton } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space } from '@/constants/theme';
import { rankExercises } from '@/lib/search-rank';
import { useQuery } from '@/lib/use-query';
import { exercisesWithWaiting, fetchExerciseLibrary, matchesSearch, MUSCLE_LABELS } from '@/lib/workouts';
import type { Exercise } from '@/types/db';

/** Search, muscle filter and the virtualised library, for the Exercises tab and the picker. */
export function ExerciseList({
  onPress,
  isOn,
  trailing,
  bottomPadding = 140,
}: {
  onPress: (e: Exercise) => void;
  /** Highlights picked rows. */
  isOn?: (e: Exercise) => boolean;
  /** Drawn at the end of a row. */
  trailing?: (e: Exercise) => ReactElement | null;
  bottomPadding?: number;
}) {
  const c = useColors();
  const router = useRouter();
  const { data, reload, error, loading } = useQuery(fetchExerciseLibrary, '', { overlay: exercisesWithWaiting });
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim();
    return rankExercises(
      (data ?? []).filter((e) => (!muscle || e.primary_muscle === muscle) && (!q || matchesSearch(e.name, q))),
      q
    );
  }, [data, query, muscle]);

  const create = (
    <Button
      label={query.trim() ? `Create \u201c${query.trim()}\u201d` : 'Create exercise'}
      icon="add"
      variant="secondary"
      onPress={() => router.push({ pathname: '/exercise/new', params: { name: query.trim(), muscle: muscle ?? undefined } })}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      {/* A solid header with a line under it, so the list scrolls cleanly away beneath the chips. */}
      <View style={[styles.header, { backgroundColor: c.bg, borderColor: c.hairline }]}>
        <View style={{ paddingHorizontal: Space.lg, paddingBottom: Space.md }}>
          <Field value={query} onChangeText={setQuery} placeholder="Search exercises" autoCorrect={false} />
        </View>
        <ChipRow>
          <Chip label="All" selected={!muscle} onPress={() => setMuscle(null)} />
          {Object.entries(MUSCLE_LABELS).map(([k, label]) => (
            <Chip key={k} label={label} selected={muscle === k} onPress={() => setMuscle(muscle === k ? null : k)} />
          ))}
        </ChipRow>
      </View>

      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={{ padding: Space.lg, gap: Space.sm, paddingBottom: bottomPadding }}
        ListHeaderComponent={data ? create : undefined}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={c.primary} style={{ paddingTop: Space.xl }} />
          ) : error ? (
            <View style={{ gap: Space.md, alignItems: 'center', paddingTop: Space.xl }}>
              <AppText color="textMuted" align="center">
                Couldn&apos;t load the exercises. {error}
              </AppText>
              <Button label="Try again" variant="secondary" icon="refresh" onPress={reload} />
            </View>
          ) : query.trim() ? (
            <AppText color="textMuted" align="center" style={{ paddingTop: Space.lg }}>
              No exercise called \u201c{query.trim()}\u201d.
            </AppText>
          ) : undefined
        }
        renderItem={({ item }) => {
          const on = isOn?.(item) ?? false;
          return (
            <Pressable
              accessibilityRole={isOn ? 'checkbox' : 'button'}
              accessibilityState={isOn ? { checked: on } : undefined}
              onPress={() => onPress(item)}
              style={[
                styles.item,
                { backgroundColor: on ? c.primarySoft : c.surface, borderColor: on ? c.primary : c.hairline },
              ]}>
              <ExerciseDemo gifId={item.gif_id} still round style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{item.name}</AppText>
                <AppText variant="small" color="textMuted">
                  {MUSCLE_LABELS[item.primary_muscle] ?? item.primary_muscle}
                  {item.created_by ? ', custom' : item.equipment && item.equipment !== 'other' ? `, ${item.equipment}` : ''}
                </AppText>
              </View>
              {trailing?.(item)}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

export function ExerciseInfoButton({ exercise }: { exercise: Exercise }) {
  const router = useRouter();
  return (
    <IconButton
      icon="information-circle-outline"
      label={`How to do ${exercise.name}`}
      onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })}
    />
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: Space.md, borderBottomWidth: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.row,
    borderWidth: 2,
  },
  avatar: { width: 44, height: 44 },
});
