import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuSheet, type MenuOption } from '@/components/menu-sheet';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { celebrateXp } from '@/components/xp-toast';
import { Fonts, hardShadow, Radius, Space } from '@/constants/theme';
import { clock } from '@/lib/dates';
import { formatVolume, MUSCLE_LABELS, type PreviousSet } from '@/lib/workouts';
import { completedSetCount, liveVolume, useWorkout, type ActiveExercise, type ActiveSet } from '@/stores/workout';
import type { ExerciseKind, FinishWorkoutResult } from '@/types/db';

const isWeb = Platform.OS === 'web';
const haptic = (style = Haptics.ImpactFeedbackStyle.Medium) => {
  if (!isWeb) Haptics.impactAsync(style);
};

function confirm(title: string, message: string, ok: string, onOk: () => void, destructive = false) {
  if (isWeb) {
    if (window.confirm(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: ok, style: destructive ? 'destructive' : 'default', onPress: onOk },
  ]);
}

export default function ActiveWorkoutScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const w = useWorkout();
  const [now, setNow] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinishWorkoutResult | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Rest timer completion
  const rest = w.rest;
  const restLeft = rest ? Math.ceil((rest.endsAt - now) / 1000) : 0;
  const firedRef = useRef<number | null>(null);
  useEffect(() => {
    if (rest && restLeft <= 0 && firedRef.current !== rest.endsAt) {
      firedRef.current = rest.endsAt;
      if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      w.skipRest();
    }
  }, [rest, restLeft, w]);

  if (result) return <Results result={result} onDone={() => router.back()} />;

  if (!w.active) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <EmptyState
          title="No workout running"
          body="Start one from the Train tab."
          action={<Button label="Close" variant="secondary" onPress={() => router.back()} />}
        />
      </View>
    );
  }

  const a = w.active;
  const elapsed = (now - new Date(a.startedAt).getTime()) / 1000;
  const sets = completedSetCount(a);

  async function finish() {
    setError(null);
    setFinishing(true);
    try {
      const res = await w.finish();
      haptic(Haptics.ImpactFeedbackStyle.Heavy);
      setResult(res);
      celebrateXp(res.prs.length ? `${res.prs.length} new PR${res.prs.length > 1 ? 's' : ''}` : 'Workout complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the workout. It is still on your phone, try again.');
    } finally {
      setFinishing(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + Space.sm, borderColor: c.hairline }]}>
        <IconButton icon="chevron-down" label="Minimise workout" onPress={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <AppText variant="stat" style={{ fontSize: 22 }}>
            {clock(elapsed)}
          </AppText>
        </View>
        <Button
          label="Finish"
          size="sm"
          variant="xp"
          loading={finishing}
          disabled={sets === 0}
          onPress={() =>
            confirm('Finish workout?', `${sets} completed set${sets === 1 ? '' : 's'} will be saved. Unticked sets are skipped.`, 'Finish', finish)
          }
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.lg, gap: Space.lg, paddingBottom: 220 }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={a.name}
          onChangeText={w.rename}
          accessibilityLabel="Workout name"
          style={[styles.title, { color: c.text }]}
        />
        <View style={styles.stats}>
          <StatPill label="Sets" value={String(sets)} />
          <StatPill label="Volume" value={formatVolume(liveVolume(a))} />
          <StatPill label="Exercises" value={String(a.exercises.length)} />
        </View>
        {error ? (
          <Card tone="flat" style={{ borderColor: c.danger }}>
            <AppText variant="smallBold" color="danger">
              {error}
            </AppText>
          </Card>
        ) : null}

        {a.exercises.map((ex, i) => (
          <ExerciseBlock key={ex.key} ex={ex} index={i} count={a.exercises.length} />
        ))}

        <Button
          label="Add exercises"
          icon="add"
          variant="secondary"
          size="lg"
          onPress={() => router.push({ pathname: '/workout/exercises', params: { mode: 'workout' } })}
        />
        <Button
          label="Discard workout"
          variant="danger"
          onPress={() =>
            confirm('Discard workout?', 'Everything you logged in this session will be deleted.', 'Discard', () => {
              w.discard();
              router.back();
            }, true)
          }
        />
      </ScrollView>

      {rest && restLeft > 0 ? (
        <View
          style={[
            styles.rest,
            { backgroundColor: c.surface, borderColor: c.border, bottom: insets.bottom + Space.lg },
            hardShadow(c.shadow, 4),
          ]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <AppText variant="small" color="textMuted" numberOfLines={1}>
                Rest after {rest.exerciseName}
              </AppText>
              <AppText variant="h1">{clock(restLeft)}</AppText>
            </View>
            <Button label="-15s" size="sm" variant="secondary" onPress={() => w.adjustRest(-15)} />
            <Button label="+15s" size="sm" variant="secondary" onPress={() => w.adjustRest(15)} />
            <Button label="Skip" size="sm" onPress={w.skipRest} />
          </View>
          <ProgressBar value={restLeft / Math.max(1, rest.duration)} color={c.primary} height={8} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={[styles.pill, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
      <AppText variant="h3">{value}</AppText>
    </View>
  );
}

function columnsFor(kind: ExerciseKind) {
  switch (kind) {
    case 'weight_reps':
      return { a: { field: 'weight', label: 'kg' }, b: { field: 'reps', label: 'Reps' } } as const;
    case 'bodyweight_reps':
      return { a: { field: 'weight', label: '+kg' }, b: { field: 'reps', label: 'Reps' } } as const;
    case 'duration':
      return { a: null, b: { field: 'duration', label: 'Sec' } } as const;
    case 'distance_time':
      return { a: { field: 'distance', label: 'km' }, b: { field: 'duration', label: 'Min' } } as const;
  }
}

function previousText(kind: ExerciseKind, p?: PreviousSet) {
  if (!p) return '–';
  switch (kind) {
    case 'weight_reps':
      return p.weight_kg != null && p.reps != null ? `${Number(p.weight_kg)} × ${p.reps}` : '–';
    case 'bodyweight_reps':
      return p.reps != null ? `${p.weight_kg ? `+${Number(p.weight_kg)} × ` : ''}${p.reps}` : '–';
    case 'duration':
      return p.duration_s != null ? `${p.duration_s}s` : '–';
    case 'distance_time':
      return p.distance_m != null ? `${Number(p.distance_m) / 1000} km` : '–';
  }
}

function ExerciseBlock({ ex, index, count }: { ex: ActiveExercise; index: number; count: number }) {
  const c = useColors();
  const w = useWorkout();
  const cols = columnsFor(ex.exercise.kind);

  const [menu, setMenu] = useState(false);
  const restOptions: [string, number][] = [
    ['No rest timer', 0],
    ['60 seconds', 60],
    ['90 seconds', 90],
    ['2 minutes', 120],
    ['3 minutes', 180],
  ];
  const menuOptions: MenuOption[] = [
    ...(index > 0 ? [{ label: 'Move up', icon: 'arrow-up' as const, onPress: () => w.moveExercise(ex.key, -1) }] : []),
    ...(index < count - 1 ? [{ label: 'Move down', icon: 'arrow-down' as const, onPress: () => w.moveExercise(ex.key, 1) }] : []),
    ...restOptions.map(([label, secs]) => ({
      label: `Rest: ${label}`,
      icon: 'timer-outline' as const,
      selected: ex.restSeconds === secs,
      onPress: () => w.setRestSeconds(ex.key, secs),
    })),
    { label: 'Remove exercise', icon: 'trash-outline', destructive: true, onPress: () => w.removeExercise(ex.key) },
  ];

  return (
    <Card style={{ gap: Space.md, padding: Space.md }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <AppText variant="h3" color="primary">
            {ex.exercise.name}
          </AppText>
          <AppText variant="small" color="textMuted">
            {MUSCLE_LABELS[ex.exercise.primary_muscle] ?? ex.exercise.primary_muscle}
            {ex.restSeconds > 0 ? `, ${ex.restSeconds}s rest` : ', no rest timer'}
          </AppText>
        </View>
        <IconButton icon="ellipsis-horizontal" label={`Options for ${ex.exercise.name}`} onPress={() => setMenu(true)} />
      </View>

      <TextInput
        value={ex.notes}
        onChangeText={(t) => w.setNotes(ex.key, t)}
        placeholder="Add a note"
        placeholderTextColor={c.textMuted}
        style={[styles.note, { color: c.text }]}
      />

      {/* Header */}
      <View style={[styles.setRow, { paddingVertical: 0 }]}>
        <AppText variant="smallBold" color="textMuted" style={styles.colSet}>
          Set
        </AppText>
        <AppText variant="smallBold" color="textMuted" style={styles.colPrev}>
          Previous
        </AppText>
        {cols.a ? (
          <AppText variant="smallBold" color="textMuted" style={styles.colInput} align="center">
            {cols.a.label}
          </AppText>
        ) : null}
        <AppText variant="smallBold" color="textMuted" style={styles.colInput} align="center">
          {cols.b.label}
        </AppText>
        <View style={styles.colCheck} />
      </View>

      {ex.sets.map((s, i) => {
        const workingNo = ex.sets.slice(0, i + 1).filter((x) => x.setType !== 'warmup').length;
        return (
          <SetRow
            key={s.key}
            set={s}
            label={s.setType === 'warmup' ? 'W' : s.setType === 'drop' ? 'D' : s.setType === 'failure' ? 'F' : String(workingNo)}
            prev={previousText(ex.exercise.kind, ex.previous[i])}
            colA={cols.a?.field}
            colB={cols.b.field}
            onChange={(patch) => w.updateSet(ex.key, s.key, patch)}
            onCycle={() => w.cycleSetType(ex.key, s.key)}
            onRemove={() => w.removeSet(ex.key, s.key)}
            onToggle={() => {
              const done = w.toggleDone(ex.key, s.key);
              if (done) haptic();
            }}
          />
        );
      })}

      <Button label="Add set" icon="add" variant="ghost" size="sm" onPress={() => w.addSet(ex.key)} />
      <MenuSheet visible={menu} title={ex.exercise.name} options={menuOptions} onClose={() => setMenu(false)} />
    </Card>
  );
}

function SetRow({
  set,
  label,
  prev,
  colA,
  colB,
  onChange,
  onCycle,
  onRemove,
  onToggle,
}: {
  set: ActiveSet;
  label: string;
  prev: string;
  colA?: 'weight' | 'distance';
  colB: 'reps' | 'duration';
  onChange: (patch: Partial<ActiveSet>) => void;
  onCycle: () => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const c = useColors();
  const typeColor =
    set.setType === 'warmup' ? c.carbs : set.setType === 'drop' ? c.fat : set.setType === 'failure' ? c.danger : c.text;
  const input = (field: 'weight' | 'distance' | 'reps' | 'duration') => (
    <TextInput
      value={set[field]}
      onChangeText={(t) => onChange({ [field]: t.replace(/[^0-9.,]/g, '') })}
      keyboardType={field === 'reps' ? 'number-pad' : 'decimal-pad'}
      selectTextOnFocus
      accessibilityLabel={field}
      placeholder="0"
      placeholderTextColor={c.textMuted}
      style={[
        styles.colInput,
        styles.input,
        { color: c.text, backgroundColor: set.done ? 'transparent' : c.bg, borderColor: set.done ? 'transparent' : c.hairline },
      ]}
    />
  );

  return (
    <View style={[styles.setRow, set.done && { backgroundColor: c.success + '26' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Set ${label}. Tap to change type, long press to delete`}
        onPress={onCycle}
        onLongPress={onRemove}
        style={styles.colSet}>
        <AppText variant="bodyBold" style={{ color: typeColor }}>
          {label}
        </AppText>
      </Pressable>
      <AppText variant="small" color="textMuted" style={styles.colPrev} numberOfLines={1}>
        {prev}
      </AppText>
      {colA ? input(colA) : null}
      {input(colB)}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: set.done }}
        accessibilityLabel="Complete set"
        onPress={onToggle}
        hitSlop={6}
        style={[styles.colCheck, styles.check, { backgroundColor: set.done ? c.success : c.hairline }]}>
        <Ionicons name="checkmark" size={18} color={set.done ? '#FFFFFF' : c.textMuted} />
      </Pressable>
    </View>
  );
}

function Results({ result, onDone }: { result: FinishWorkoutResult; onDone: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="fade">
      <View style={[styles.results, { backgroundColor: c.primary, paddingTop: insets.top + Space.xxl, paddingBottom: insets.bottom + Space.xl }]}>
        <View style={{ gap: Space.lg }}>
          <AppText variant="h2" color="#FFFFFF">
            Workout saved
          </AppText>
          <AppText variant="hero" color="#FFFFFF" style={{ fontSize: 64, lineHeight: 66 }}>
            +{result.xp} XP
          </AppText>
          <View style={styles.stats}>
            <StatPill label="Sets" value={String(result.total_sets)} />
            <StatPill label="Volume" value={formatVolume(Number(result.total_volume))} />
          </View>
          {result.prs.length > 0 ? (
            <Card style={{ gap: Space.md }}>
              <AppText variant="h3">New personal records</AppText>
              {result.prs.map((p) => (
                <View key={p.exercise_id} style={styles.row}>
                  <Ionicons name="trophy" size={18} color={c.carbs} />
                  <AppText variant="body" style={{ flex: 1 }}>
                    {p.name}
                  </AppText>
                  <AppText variant="bodyBold">
                    {Number(p.e1rm)} kg
                  </AppText>
                </View>
              ))}
              <AppText variant="small" color="textMuted">
                Estimated one-rep max, up from your previous best.
              </AppText>
            </Card>
          ) : null}
        </View>
        <Button label="Done" size="lg" variant="secondary" onPress={onDone} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space.xl },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
    borderBottomWidth: 1,
  },
  title: { fontFamily: Fonts.display, fontSize: 28, letterSpacing: -0.5, padding: 0, minWidth: 0 },
  stats: { flexDirection: 'row', gap: Space.sm },
  pill: { flex: 1, borderWidth: 1.5, borderRadius: Radius.row, padding: Space.md, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  note: { fontFamily: Fonts.body, fontSize: 14, paddingVertical: 4 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 10 },
  colSet: { width: 30, alignItems: 'center' },
  colPrev: { flex: 1.3, minWidth: 0 },
  colInput: { flex: 1, minWidth: 0 },
  colCheck: { width: 36 },
  input: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    textAlign: 'center',
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
  },
  check: { height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rest: {
    position: 'absolute',
    left: Space.lg,
    right: Space.lg,
    borderWidth: 2,
    borderRadius: Radius.card,
    padding: Space.lg,
    gap: Space.md,
  },
  results: { flex: 1, paddingHorizontal: Space.xl, justifyContent: 'space-between' },
});
