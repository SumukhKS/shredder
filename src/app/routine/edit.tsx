import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sortable } from '@/components/sortable';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { EmptyState, Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Fonts, Space } from '@/constants/theme';
import { enqueue } from '@/lib/outbox';
import { fetchRoutines, MUSCLE_LABELS, saveRoutine } from '@/lib/workouts';
import { usePicker } from '@/stores/picker';
import type { Exercise } from '@/types/db';

interface Row {
  key: string;
  exercise: Exercise;
  sets: number;
  reps: string;
  rest: number;
}

let n = 0;
const key = () => `r${n++}`;
const rowKey = (r: Row) => r.key;

export default function RoutineEditor() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const take = usePicker((s) => s.take);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  useEffect(() => {
    if (!id) return;
    fetchRoutines().then((all) => {
      const r = all.find((x) => x.id === id);
      if (!r) return;
      setName(r.name);
      setRows(
        r.routine_exercises.map((re) => ({
          key: key(),
          exercise: re.exercises,
          sets: re.target_sets,
          reps: re.target_reps,
          rest: re.rest_seconds,
        }))
      );
    });
  }, [id]);

  // Pick up exercises chosen in the picker modal
  useFocusEffect(
    useCallback(() => {
      const picked = take();
      if (picked?.length) {
        setRows((r) => [
          ...r,
          ...picked.map((e) => ({ key: key(), exercise: e, sets: 3, reps: e.kind === 'duration' ? '60s' : '8-12', rest: 90 })),
        ]);
      }
    }, [take])
  );

  const update = (k: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const reorder = (keys: string[]) => setRows((r) => keys.map((k) => r.find((x) => x.key === k)).filter((x): x is Row => !!x));

  async function save() {
    if (!name.trim()) return setError('Give the routine a name.');
    if (rows.length === 0) return setError('Add at least one exercise.');
    setSaving(true);
    setError(null);
    try {
      saveRoutine({
        id,
        name: name.trim(),
        shown: rows.map((r) => r.exercise),
        exercises: rows.map((r) => ({
          exercise_id: r.exercise.id,
          target_sets: r.sets,
          target_reps: r.reps.trim() || '8-12',
          rest_seconds: r.rest,
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
        <EmptyState
          title="Add your exercises"
          body="Pick the moves for this day. You can set target sets, reps and rest for each."
        />
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
            <View style={styles.row}>
              <Stepper label="Sets" value={r.sets} onChange={(v) => update(r.key, { sets: Math.min(10, Math.max(1, v)) })} />
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="small" color="textMuted">
                  Reps
                </AppText>
                <TextInput
                  value={r.reps}
                  onChangeText={(t) => update(r.key, { reps: t })}
                  style={[styles.reps, { color: c.text, borderColor: c.hairline, backgroundColor: c.bg }]}
                />
              </View>
              <Stepper
                label="Rest"
                value={r.rest}
                display={r.rest ? `${r.rest}s` : 'Off'}
                onChange={(v) => update(r.key, { rest: Math.min(300, Math.max(0, v)) })}
                step={15}
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
    </Screen>
  );
}

function Stepper({
  label,
  value,
  onChange,
  step = 1,
  display,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  display?: string;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
      <View style={[styles.stepper, { borderColor: c.hairline, backgroundColor: c.bg }]}>
        <IconButton icon="remove" size={18} label={`Fewer ${label}`} onPress={() => onChange(value - step)} />
        <AppText variant="bodyBold" style={{ minWidth: 34 }} align="center">
          {display ?? value}
        </AppText>
        <IconButton icon="add" size={18} label={`More ${label}`} onPress={() => onChange(value + step)} />
      </View>
    </View>
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
  stepper: { flexDirection: 'row', alignItems: 'center', height: 40, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 2 },
  footer: { paddingHorizontal: Space.lg, paddingTop: Space.lg, borderTopWidth: 1 },
});
