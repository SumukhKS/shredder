import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuSheet } from '@/components/menu-sheet';
import { Sortable } from '@/components/sortable';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { EmptyState, Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Fonts, Space } from '@/constants/theme';
import { enqueue } from '@/lib/outbox';
import { readCache } from '@/lib/use-query';
import { cleanInteger } from '@/lib/validate';
import { fetchRoutines, MUSCLE_LABELS, routinesWithWaiting, routineTargets, saveRoutine } from '@/lib/workouts';
import { usePicker } from '@/stores/picker';
import type { Exercise, Routine } from '@/types/db';

interface SetRow {
  key: string;
  reps: string;
}

interface Row {
  key: string;
  exercise: Exercise;
  sets: SetRow[];
  rest: number;
  restOn: boolean;
}

const REST_LENGTHS: [string, number][] = [
  ['60 seconds', 60],
  ['90 seconds', 90],
  ['2 minutes', 120],
  ['3 minutes', 180],
];

const MAX_TARGET = 1000;

let n = 0;
const key = () => `r${n++}`;
const rowKey = (r: Row) => r.key;
const blankSet = (): SetRow => ({ key: key(), reps: '' });
const targetLabel = (e: Exercise) => (e.kind === 'duration' ? 'Seconds' : e.kind === 'distance_time' ? 'Minutes' : 'Reps');

export default function RoutineEditor() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const take = usePicker((s) => s.take);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [restFor, setRestFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  useEffect(() => {
    if (!id) return;
    // Without a connection, the last routines loaded are still there to edit.
    fetchRoutines()
      .catch(() => readCache<Routine[]>('routines|') ?? [])
      .then((all) => {
        const r = routinesWithWaiting(all).find((x) => x.id === id);
        if (!r) return;
        setName(r.name);
        setRows(
          r.routine_exercises.map((re) => ({
            key: key(),
            exercise: re.exercises,
            sets: routineTargets(re).map((t) => ({ key: key(), reps: t == null ? '' : String(t) })),
            rest: re.rest_seconds || 90,
            restOn: re.rest_enabled !== false && re.rest_seconds > 0,
          }))
        );
      });
  }, [id]);

  // Pick up exercises chosen in the picker modal
  useFocusEffect(
    useCallback(() => {
      const picked = take();
      if (picked?.length) {
        setRows((r) => [...r, ...picked.map((e) => ({ key: key(), exercise: e, sets: [blankSet()], rest: 90, restOn: true }))]);
      }
    }, [take])
  );

  const update = (k: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const reorder = (keys: string[]) => setRows((r) => keys.map((k) => r.find((x) => x.key === k)).filter((x): x is Row => !!x));

  async function save() {
    if (!name.trim()) return setError('Give the routine a name.');
    if (rows.length === 0) return setError('Add at least one exercise.');
    if (rows.some((r) => r.sets.some((x) => Number(x.reps) > MAX_TARGET))) {
      return setError(`Set targets can be at most ${MAX_TARGET.toLocaleString()}.`);
    }
    setSaving(true);
    setError(null);
    try {
      saveRoutine({
        id,
        name: name.trim(),
        shown: rows.map((r) => r.exercise),
        exercises: rows.map((r) => ({
          exercise_id: r.exercise.id,
          target_sets: r.sets.length,
          target_reps: r.sets[0].reps || '8-12',
          rest_seconds: r.rest,
          rest_enabled: r.restOn,
          set_targets: r.sets.map((x) => ({ reps: x.reps ? Number(x.reps) : null })),
        })),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the routine.');
      setSaving(false);
    }
  }

  function remove() {
    const go = () => {
      enqueue({ kind: 'delete', table: 'routines', match: { id: id! } });
      router.back();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this routine? Past workouts stay in your history.')) go();
    } else {
      Alert.alert('Delete routine?', 'Past workouts stay in your history.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: go },
      ]);
    }
  }

  return (
    <Screen
      padTop={false}
      scrollRef={scrollRef}
      footer={
        <View
          style={[styles.footer, { backgroundColor: c.bg, borderColor: c.hairline, paddingBottom: insets.bottom + Space.lg }]}>
          <Button label="Save routine" size="lg" loading={saving} onPress={save} />
        </View>
      }>
      <Stack.Screen options={{ title: id ? 'Edit routine' : 'New routine' }} />
      <Field label="Name" value={name} onChangeText={setName} placeholder="Push day" error={error} />

      {rows.length === 0 ? (
        <EmptyState title="Add your exercises" body="Pick the moves for this day, then add a row for each set with its target." />
      ) : null}

      <Sortable
        items={rows}
        keyOf={rowKey}
        mode="handle"
        gap={Space.lg}
        scrollRef={scrollRef}
        onReorder={reorder}
        renderItem={(r, { handle }) => (
          <Card style={{ gap: Space.md }}>
            <View style={styles.row}>
              {handle}
              <View style={{ flex: 1 }}>
                <AppText variant="h3">{r.exercise.name}</AppText>
                <AppText variant="small" color="textMuted">
                  {MUSCLE_LABELS[r.exercise.primary_muscle] ?? r.exercise.primary_muscle}
                </AppText>
              </View>
              <IconButton
                icon="trash-outline"
                label="Remove"
                color={c.danger}
                onPress={() => setRows((x) => x.filter((y) => y.key !== r.key))}
              />
            </View>
            {r.sets.map((x, i) => (
              <View key={x.key} style={styles.row}>
                <AppText variant="bodyBold" color="textMuted" style={styles.setNo}>
                  {i + 1}
                </AppText>
                <TextInput
                  value={x.reps}
                  onChangeText={(t) =>
                    update(r.key, {
                      sets: r.sets.map((y) => (y.key === x.key ? { ...y, reps: cleanInteger(t).slice(0, 4) } : y)),
                    })
                  }
                  keyboardType="number-pad"
                  accessibilityLabel={`${targetLabel(r.exercise)} for set ${i + 1}`}
                  placeholder={targetLabel(r.exercise)}
                  placeholderTextColor={c.textMuted}
                  style={[styles.reps, { flex: 1, color: c.text, borderColor: c.hairline, backgroundColor: c.bg }]}
                />
                {r.sets.length > 1 ? (
                  <IconButton
                    icon="close"
                    size={18}
                    label={`Delete set ${i + 1}`}
                    onPress={() => update(r.key, { sets: r.sets.filter((y) => y.key !== x.key) })}
                  />
                ) : null}
              </View>
            ))}
            <Button
              label="Add set"
              icon="add"
              variant="secondary"
              size="sm"
              onPress={() => update(r.key, { sets: [...r.sets, blankSet()] })}
            />
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change rest length"
                onPress={() => setRestFor(r.key)}
                style={{ flex: 1 }}>
                <AppText variant="small" color="textMuted">
                  Rest timer{r.restOn ? `, ${r.rest}s (tap to change)` : ', off'}
                </AppText>
              </Pressable>
              <Switch
                accessibilityLabel={`Rest timer for ${r.exercise.name}`}
                value={r.restOn}
                onValueChange={(on) => update(r.key, { restOn: on })}
                trackColor={{ true: c.primary, false: c.border }}
                thumbColor={c.text}
              />
            </View>
          </Card>
        )}
      />

      <Button
        label="Add exercises"
        icon="add"
        variant="secondary"
        onPress={() => router.push({ pathname: '/workout/exercises', params: { mode: 'routine' } })}
      />
      {id ? <Button label="Delete routine" variant="danger" onPress={remove} /> : null}
      <MenuSheet
        visible={restFor !== null}
        title="Rest length"
        onClose={() => setRestFor(null)}
        options={REST_LENGTHS.map(([label, secs]) => ({
          label,
          icon: 'timer-outline' as const,
          selected: rows.find((r) => r.key === restFor)?.rest === secs,
          onPress: () => restFor && update(restFor, { rest: secs }),
        }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  reps: {
    minWidth: 0,
    height: 40,
    borderWidth: 1.5,
    borderRadius: 10,
    textAlign: 'center',
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    // No Android default padding, so the text fits the box instead of scrolling inside it.
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  setNo: { width: 22, textAlign: 'center' },
  footer: { paddingHorizontal: Space.lg, paddingTop: Space.lg, borderTopWidth: 1 },
});
