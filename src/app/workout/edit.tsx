import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseDemo } from '@/components/exercise-demo';
import { Sortable } from '@/components/sortable';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { WeekCalendar } from '@/components/week-calendar';
import { Fonts, Radius, Space } from '@/constants/theme';
import { clock, fromDay, toDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { usePicker } from '@/stores/picker';
import type { Exercise, ExerciseKind, SetType } from '@/types/db';

interface EditSet {
  key: string;
  type: SetType;
  weight: string;
  reps: string;
  duration: string;
  distance: string;
}

interface EditExercise {
  key: string;
  exercise: Exercise;
  notes: string;
  sets: EditSet[];
}

interface Loaded {
  name: string;
  day: string;
  started_at: string;
  finished_at: string;
  workout_exercises: {
    position: number;
    notes: string | null;
    exercises: Exercise;
    workout_sets: {
      position: number;
      set_type: SetType;
      weight_kg: number | null;
      reps: number | null;
      duration_s: number | null;
      distance_m: number | null;
    }[];
  }[];
}

let n = 0;
const key = () => `e${n++}`;
const exKey = (e: EditExercise) => e.key;
const TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const TYPE_LETTER: Record<SetType, string> = { normal: '', warmup: 'W', drop: 'D', failure: 'F' };

// Cardio is shown as km and minutes, timed holds as seconds; the database keeps metres and seconds.
const cardio = (k: ExerciseKind) => k === 'distance_time';
const show = (v: number | null, div = 1) => (v == null ? '' : String(Math.round((Number(v) / div) * 100) / 100));
const store = (v: string, mult = 1) => {
  const x = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(x) ? null : Math.round(x * mult * 100) / 100;
};
const pad = (x: number) => String(x).padStart(2, '0');

/** Seconds in "1:05:30", "45:10" or "60" (a bare number is minutes); null when it can't be read. */
function parseLength(text: string): number | null {
  const parts = text.trim().split(/[:.]/);
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.length === 1) return n[0] * 60;
  if (n.slice(1).some((x) => x > 59)) return null;
  return n.length === 2 ? n[0] * 60 + n[1] : n[0] * 3600 + n[1] * 60 + n[2];
}

/** Fix a workout after it was logged: name, date, start time, length, exercises and every set. */
export default function EditWorkout() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const take = usePicker((s) => s.take);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [day, setDay] = useState(toDay());
  const [start, setStart] = useState('');
  // Length as h:mm:ss or m:ss (a plain number is minutes), and the start's seconds, so saving keeps it exact.
  const [length, setLength] = useState('');
  const [startSeconds, setStartSeconds] = useState(0);
  const [rows, setRows] = useState<EditExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('workouts')
      .select(
        'name, day, started_at, finished_at, workout_exercises(position, notes, exercises(*), workout_sets(position, set_type, weight_kg, reps, duration_s, distance_m))'
      )
      .eq('id', id)
      .single()
      .then(({ data, error: e }) => {
        if (e || !data) return setError(e?.message ?? 'Could not load the workout.');
        const w = data as unknown as Loaded;
        const begin = new Date(w.started_at);
        setName(w.name);
        setDay(w.day);
        setStart(`${pad(begin.getHours())}:${pad(begin.getMinutes())}`);
        setStartSeconds(begin.getSeconds());
        setLength(clock(Math.max(1, Math.round((new Date(w.finished_at).getTime() - begin.getTime()) / 1000))));
        setRows(
          [...w.workout_exercises]
            .sort((a, b) => a.position - b.position)
            .map((we) => ({
              key: key(),
              exercise: we.exercises,
              notes: we.notes ?? '',
              sets: [...we.workout_sets]
                .sort((a, b) => a.position - b.position)
                .map((s) => ({
                  key: key(),
                  type: s.set_type,
                  weight: show(s.weight_kg),
                  reps: show(s.reps),
                  duration: show(s.duration_s, cardio(we.exercises.kind) ? 60 : 1),
                  distance: show(s.distance_m, cardio(we.exercises.kind) ? 1000 : 1),
                })),
            }))
        );
        setLoaded(true);
      });
  }, [id]);

  // Exercises chosen in the picker modal join the end of the list.
  useFocusEffect(
    useCallback(() => {
      const picked = take();
      if (picked?.length) {
        setRows((r) => [
          ...r,
          ...picked.map((e) => ({
            key: key(),
            exercise: e,
            notes: '',
            sets: [{ key: key(), type: 'normal' as const, weight: '', reps: '', duration: '', distance: '' }],
          })),
        ]);
      }
    }, [take])
  );

  const patchEx = (k: string, fn: (e: EditExercise) => EditExercise) => setRows((r) => r.map((e) => (e.key === k ? fn(e) : e)));
  const patchSet = (ek: string, sk: string, patch: Partial<EditSet>) =>
    patchEx(ek, (e) => ({ ...e, sets: e.sets.map((s) => (s.key === sk ? { ...s, ...patch } : s)) }));
  const reorder = (keys: string[]) =>
    setRows((r) => keys.map((k) => r.find((x) => x.key === k)).filter((x): x is EditExercise => !!x));

  async function save() {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(start.trim());
    const secs = parseLength(length);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return setError('Enter the start time as HH:MM, e.g. 07:30.');
    if (secs == null || secs < 1 || secs > 24 * 3600)
      return setError('Enter how long the workout lasted as h:mm:ss or m:ss, e.g. 1:05:30 or 45:10.');
    const exercises = rows
      .map((e) => {
        const k = e.exercise.kind;
        return {
          exercise_id: e.exercise.id,
          notes: e.notes.trim() || null,
          sets: e.sets
            .map((s) => ({
              set_type: s.type,
              weight_kg: store(s.weight),
              reps: store(s.reps),
              duration_s: store(s.duration, cardio(k) ? 60 : 1),
              distance_m: store(s.distance, cardio(k) ? 1000 : 1),
            }))
            .filter((s) => s.weight_kg != null || s.reps != null || s.duration_s != null || s.distance_m != null),
        };
      })
      .filter((e) => e.sets.length > 0);
    if (!exercises.length) return setError('Keep at least one exercise with a filled-in set.');

    const begin = fromDay(day);
    begin.setHours(Number(m[1]), Number(m[2]), startSeconds, 0);
    const end = new Date(begin.getTime() + secs * 1000);
    setSaving(true);
    setError(null);
    const { error: e } = await supabase.rpc('update_workout', {
      p: { id, name: name.trim(), day, started_at: begin.toISOString(), finished_at: end.toISOString(), exercises },
    });
    if (e) {
      setSaving(false);
      return setError(e.message);
    }
    router.back();
  }

  return (
    <Screen
      padTop={false}
      scrollRef={scrollRef}
      footer={
        <View style={[styles.footer, { backgroundColor: c.bg, borderColor: c.hairline, paddingBottom: insets.bottom + Space.lg }]}>
          {error ? (
            <AppText variant="small" color="danger">
              {error}
            </AppText>
          ) : null}
          <Button label="Save changes" size="lg" loading={saving} disabled={!loaded} onPress={save} />
        </View>
      }>
      <Stack.Screen options={{ title: 'Edit workout' }} />
      <Field label="Name" value={name} onChangeText={setName} placeholder="Push day" />

      <SectionHeader title="Date" />
      {loaded ? <WeekCalendar day={day} onChange={setDay} kind="workout" /> : null}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="Start time" value={start} onChangeText={setStart} placeholder="07:30" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Length"
            value={length}
            onChangeText={setLength}
            placeholder="1:00:00"
            keyboardType="numbers-and-punctuation"
            hint="h:mm:ss"
          />
        </View>
      </View>

      <SectionHeader title="Exercises" />
      <Sortable
        items={rows}
        keyOf={exKey}
        mode="handle"
        gap={Space.lg}
        scrollRef={scrollRef}
        onReorder={reorder}
        renderItem={(e, { handle }) => (
          <ExerciseEditor
            ex={e}
            handle={handle}
            onRemove={() => setRows((r) => r.filter((x) => x.key !== e.key))}
            onNotes={(notes) => patchEx(e.key, (x) => ({ ...x, notes }))}
            onSet={(sk, patch) => patchSet(e.key, sk, patch)}
            onRemoveSet={(sk) => patchEx(e.key, (x) => ({ ...x, sets: x.sets.filter((s) => s.key !== sk) }))}
            onAddSet={() =>
              patchEx(e.key, (x) => {
                const last = x.sets[x.sets.length - 1];
                const blank = { type: 'normal' as const, weight: '', reps: '', duration: '', distance: '' };
                return { ...x, sets: [...x.sets, { ...(last ?? blank), type: last?.type === 'warmup' ? 'normal' : (last?.type ?? 'normal'), key: key() }] };
              })
            }
          />
        )}
      />
      <Button
        label="Add exercises"
        icon="add"
        variant="secondary"
        onPress={() => router.push({ pathname: '/workout/exercises', params: { mode: 'routine' } })}
      />
    </Screen>
  );
}

function ExerciseEditor({
  ex,
  handle,
  onRemove,
  onNotes,
  onSet,
  onRemoveSet,
  onAddSet,
}: {
  ex: EditExercise;
  handle: React.ReactNode;
  onRemove: () => void;
  onNotes: (notes: string) => void;
  onSet: (setKey: string, patch: Partial<EditSet>) => void;
  onRemoveSet: (setKey: string) => void;
  onAddSet: () => void;
}) {
  const c = useColors();
  const kind = ex.exercise.kind;
  const cols: { field: keyof EditSet; label: string }[] =
    kind === 'weight_reps'
      ? [
          { field: 'weight', label: 'kg' },
          { field: 'reps', label: 'Reps' },
        ]
      : kind === 'bodyweight_reps'
        ? [
            { field: 'weight', label: '+kg' },
            { field: 'reps', label: 'Reps' },
          ]
        : kind === 'duration'
          ? [{ field: 'duration', label: 'Seconds' }]
          : [
              { field: 'distance', label: 'km' },
              { field: 'duration', label: 'Minutes' },
            ];
  // Working sets are numbered; warm-up, drop and failure sets show their letter.
  const labels = ex.sets.map(
    (s, i) => TYPE_LETTER[s.type] || String(ex.sets.slice(0, i + 1).filter((x) => x.type !== 'warmup').length)
  );

  return (
    <Card style={{ gap: Space.md }}>
      <View style={styles.row}>
        {handle}
        <ExerciseDemo gifId={ex.exercise.gif_id} still round style={styles.icon} />
        <AppText variant="h3" color="primary" style={{ flex: 1 }} numberOfLines={2}>
          {ex.exercise.name}
        </AppText>
        <IconButton icon="trash-outline" label={`Remove ${ex.exercise.name}`} color={c.danger} onPress={onRemove} />
      </View>
      <TextInput
        value={ex.notes}
        onChangeText={onNotes}
        placeholder="Notes"
        placeholderTextColor={c.textMuted}
        style={[styles.notes, { color: c.text, borderColor: c.hairline }]}
      />
      <View style={styles.setRow}>
        <AppText variant="smallBold" color="textMuted" style={styles.colSet}>
          Set
        </AppText>
        {cols.map((col) => (
          <AppText key={col.field} variant="smallBold" color="textMuted" align="center" style={{ flex: 1 }}>
            {col.label}
          </AppText>
        ))}
        <View style={{ width: 40 }} />
      </View>
      {ex.sets.map((s, i) => {
        const letter = labels[i];
        return (
          <View key={s.key} style={styles.setRow}>
            {/* Tap the set label to cycle normal, warm-up, drop and failure. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Set ${letter}, ${s.type}. Tap to change the set type`}
              onPress={() => onSet(s.key, { type: TYPES[(TYPES.indexOf(s.type) + 1) % TYPES.length] })}
              style={[styles.colSet, styles.typeButton, { backgroundColor: c.surfaceHi }]}>
              <AppText
                variant="bodyBold"
                style={{
                  color: s.type === 'warmup' ? c.carbs : s.type === 'drop' ? c.fat : s.type === 'failure' ? c.danger : c.text,
                }}>
                {letter}
              </AppText>
            </Pressable>
            {cols.map((col) => (
              <TextInput
                key={col.field}
                value={s[col.field]}
                onChangeText={(v) => onSet(s.key, { [col.field]: v })}
                keyboardType={col.field === 'reps' ? 'number-pad' : 'decimal-pad'}
                selectTextOnFocus
                accessibilityLabel={col.label}
                placeholder="0"
                placeholderTextColor={c.textMuted}
                style={[styles.input, { color: c.text, borderColor: c.hairline, backgroundColor: c.bg }]}
              />
            ))}
            <IconButton icon="close" size={18} label="Delete set" color={c.textMuted} onPress={() => onRemoveSet(s.key)} />
          </View>
        );
      })}
      <Pressable onPress={onAddSet} accessibilityRole="button" style={[styles.addSet, { borderColor: c.border }]}>
        <Ionicons name="add" size={16} color={c.text} />
        <AppText variant="smallBold">Add set</AppText>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  icon: { width: 36, height: 36 },
  notes: { borderBottomWidth: 1, fontFamily: Fonts.body, fontSize: 14, paddingVertical: 4 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  colSet: { width: 34, textAlign: 'center' },
  typeButton: { height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderWidth: 1.5,
    borderRadius: 10,
    textAlign: 'center',
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
  },
  addSet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.row,
  },
  footer: { paddingHorizontal: Space.lg, paddingTop: Space.lg, borderTopWidth: 1, gap: Space.sm },
});
