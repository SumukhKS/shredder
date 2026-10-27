import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeInDown, useAnimatedRef, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseDemo } from '@/components/exercise-demo';
import { MenuSheet, type MenuOption } from '@/components/menu-sheet';
import { PrBadge } from '@/components/pr-badge';
import { TextSheet } from '@/components/number-sheet';
import { celebratePr, PrCelebrationHost } from '@/components/pr-celebration';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { Sortable } from '@/components/sortable';
import { EmptyState, GestureScrollView } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Fonts, hardShadow, Radius, Space } from '@/constants/theme';
import { clock } from '@/lib/dates';
import { formatVolume, MUSCLE_LABELS, type PreviousSet } from '@/lib/workouts';
import { refreshStreaks } from '@/lib/streak';
import {
  completedSetCount,
  liveVolume,
  placeholderFor,
  useWorkout,
  type ActiveExercise,
  type ActiveSet,
  type SetField,
} from '@/stores/workout';
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
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

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
      refreshStreaks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the workout. It is still on your phone, try again.');
    } finally {
      setFinishing(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
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
          variant="accent"
          loading={finishing}
          disabled={sets === 0}
          onPress={() =>
            confirm(
              'Finish workout?',
              `${sets} completed set${sets === 1 ? '' : 's'} will be saved. Unticked sets are skipped.`,
              'Finish',
              finish
            )
          }
        />
        <IconButton icon="ellipsis-vertical" label="Workout options" onPress={() => setMenu(true)} />
      </View>

      <GestureScrollView
        ref={scrollRef as never}
        contentContainerStyle={{ padding: Space.lg, gap: Space.lg, paddingBottom: 220 }}
        keyboardShouldPersistTaps="handled">
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

        {/* Drag an exercise by its grip to move it. */}
        <Sortable
          items={a.exercises}
          keyOf={exerciseKey}
          mode="handle"
          gap={Space.lg}
          scrollRef={scrollRef}
          onReorder={w.reorderExercises}
          renderItem={(ex, { handle }) => <ExerciseBlock ex={ex} handle={a.exercises.length > 1 ? handle : null} />}
        />

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
            confirm(
              'Discard workout?',
              'Everything you logged in this session will be deleted.',
              'Discard',
              () => {
                w.discard();
                router.back();
              },
              true
            )
          }
        />
      </GestureScrollView>

      <MenuSheet
        visible={menu}
        title={a.name}
        onClose={() => setMenu(false)}
        options={[
          { label: 'Rename workout', icon: 'create-outline', onPress: () => setRenaming(true) },
          {
            label: 'Add exercises',
            icon: 'add',
            onPress: () => router.push({ pathname: '/workout/exercises', params: { mode: 'workout' } }),
          },
          ...(sets > 0
            ? [
                {
                  label: 'Finish and save',
                  icon: 'checkmark-done' as const,
                  onPress: () =>
                    confirm('Finish workout?', `${sets} completed set${sets === 1 ? '' : 's'} will be saved.`, 'Finish', finish),
                },
              ]
            : []),
          {
            label: 'Discard workout',
            icon: 'trash-outline',
            destructive: true,
            onPress: () =>
              confirm(
                'Discard workout?',
                'Everything you logged in this session will be deleted.',
                'Discard',
                () => {
                  w.discard();
                  router.back();
                },
                true
              ),
          },
        ]}
      />
      <TextSheet
        visible={renaming}
        title="Rename workout"
        initial={a.name}
        onClose={() => setRenaming(false)}
        onSave={w.rename}
      />

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
      <PrCelebrationHost />
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

const exerciseKey = (ex: ActiveExercise) => ex.key;

function ExerciseBlock({ ex, handle }: { ex: ActiveExercise; handle: React.ReactNode }) {
  const c = useColors();
  const w = useWorkout();
  const router = useRouter();
  const cols = columnsFor(ex.exercise.kind);
  const showHowTo = () => router.push({ pathname: '/exercise/[id]', params: { id: ex.exercise.id } });

  const [menu, setMenu] = useState(false);
  const [setMenuFor, setSetMenuFor] = useState<string | null>(null);
  const restOptions: [string, number][] = [
    ['No rest timer', 0],
    ['60 seconds', 60],
    ['90 seconds', 90],
    ['2 minutes', 120],
    ['3 minutes', 180],
  ];
  const menuOptions: MenuOption[] = [
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
        {handle}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`How to do ${ex.exercise.name}`}
          onPress={showHowTo}
          style={[styles.row, { flex: 1 }]}>
          <ExerciseDemo gifId={ex.exercise.gif_id} still round style={styles.demoThumb} />
          <View style={{ flex: 1 }}>
            <AppText variant="h3" color="primary">
              {ex.exercise.name}
            </AppText>
            <AppText variant="small" color="textMuted">
              {MUSCLE_LABELS[ex.exercise.primary_muscle] ?? ex.exercise.primary_muscle}
              {ex.restSeconds > 0 ? `, ${ex.restSeconds}s rest` : ', no rest timer'}
            </AppText>
          </View>
        </Pressable>
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
        <View style={styles.colMedal} />
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
            placeholder={(field) => placeholderFor(ex, i, field)}
            onChange={(patch) => w.updateSet(ex.key, s.key, patch)}
            onMenu={() => setSetMenuFor(s.key)}
            onRemove={() => w.removeSet(ex.key, s.key)}
            onToggle={() => {
              const { done, pr } = w.toggleDone(ex.key, s.key);
              if (pr) celebratePr(pr);
              else if (done) haptic();
            }}
          />
        );
      })}

      <Button label="Add set" icon="add" variant="secondary" size="sm" onPress={() => w.addSet(ex.key)} />
      <MenuSheet visible={menu} title={ex.exercise.name} options={menuOptions} onClose={() => setMenu(false)} />
      <MenuSheet
        visible={setMenuFor !== null}
        title="Set"
        onClose={() => setSetMenuFor(null)}
        options={
          setMenuFor
            ? [
                ...SET_TYPES.map(([type, label]) => ({
                  label,
                  icon: 'pricetag-outline' as const,
                  selected: ex.sets.find((x) => x.key === setMenuFor)?.setType === type,
                  onPress: () => w.updateSet(ex.key, setMenuFor, { setType: type }),
                })),
                { label: 'Delete set', icon: 'trash-outline', destructive: true, onPress: () => w.removeSet(ex.key, setMenuFor) },
              ]
            : []
        }
      />
    </Card>
  );
}

const SET_TYPES: [ActiveSet['setType'], string][] = [
  ['normal', 'Normal set'],
  ['warmup', 'Warm-up set'],
  ['drop', 'Drop set'],
  ['failure', 'To failure'],
];

function SetRow({
  set,
  label,
  prev,
  colA,
  colB,
  placeholder,
  onChange,
  onMenu,
  onRemove,
  onToggle,
}: {
  set: ActiveSet;
  label: string;
  prev: string;
  colA?: 'weight' | 'distance';
  colB: 'reps' | 'duration';
  placeholder: (field: SetField) => string;
  onChange: (patch: Partial<ActiveSet>) => void;
  onMenu: () => void;
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
      placeholder={placeholder(field) || '0'}
      placeholderTextColor={c.textMuted}
      style={[
        styles.colInput,
        styles.input,
        { color: c.text, backgroundColor: set.done ? 'transparent' : c.bg, borderColor: set.done ? 'transparent' : c.hairline },
      ]}
    />
  );

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_progress, _drag, swipe) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete set ${label}`}
          onPress={() => {
            swipe.close();
            onRemove();
          }}
          style={[styles.swipeDelete, { backgroundColor: c.danger }]}>
          <Ionicons name="trash" size={18} color="#FFFFFF" />
        </Pressable>
      )}>
      <View style={[styles.setRow, { backgroundColor: set.done ? c.primarySoft : c.surface }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Set ${label}. Tap for set type or to delete it`}
          onPress={onMenu}
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
        <View style={styles.colMedal}>{set.pr ? <PrBadge size={20} /> : null}</View>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: set.done }}
          accessibilityLabel="Complete set"
          onPress={onToggle}
          hitSlop={6}
          style={[styles.colCheck, styles.check, { backgroundColor: set.done ? c.success : c.hairline }]}>
          <Ionicons name="checkmark" size={18} color={set.done ? c.onPrimary : c.textMuted} />
        </Pressable>
      </View>
    </ReanimatedSwipeable>
  );
}

function Results({ result, onDone }: { result: FinishWorkoutResult; onDone: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const prs = result.prs;
  return (
    <Modal visible animationType="fade">
      <View
        style={[
          styles.results,
          { backgroundColor: c.bg, paddingTop: insets.top + Space.xxl, paddingBottom: insets.bottom + Space.xl },
        ]}>
        <View style={{ gap: Space.lg }}>
          {prs.length ? (
            <Animated.View entering={ZoomIn.springify().damping(12)}>
              <PrBadge size={96} />
            </Animated.View>
          ) : (
            <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.doneBadge, { backgroundColor: c.primary }]}>
              <Ionicons name="checkmark" size={40} color={c.onPrimary} />
            </Animated.View>
          )}
          <AppText variant="hero" style={{ fontSize: 40, lineHeight: 44 }}>
            {prs.length ? `${prs.length} new PR${prs.length > 1 ? 's' : ''}` : 'Workout saved'}
          </AppText>
          <View style={styles.stats}>
            <StatPill label="Sets" value={String(result.total_sets)} />
            <StatPill label="Volume" value={formatVolume(Number(result.total_volume))} />
          </View>
          {prs.length > 0 ? (
            <Card style={{ gap: Space.md }}>
              <AppText variant="h3">Personal records</AppText>
              {prs.map((p, i) => (
                <Animated.View key={p.exercise_id} entering={FadeInDown.delay(250 + i * 150).springify()} style={styles.row}>
                  <PrBadge size={30} />
                  <AppText variant="body" style={{ flex: 1 }}>
                    {p.name}
                  </AppText>
                  <View style={{ alignItems: 'flex-end' }}>
                    <AppText variant="bodyBold">{Number(p.e1rm)} kg</AppText>
                    <AppText variant="small" color="textMuted">
                      was {Number(p.previous)} kg
                    </AppText>
                  </View>
                </Animated.View>
              ))}
              <AppText variant="small" color="textMuted">
                Estimated one-rep max, up from your previous best.
              </AppText>
            </Card>
          ) : null}
        </View>
        <Button label="Done" size="lg" onPress={onDone} />
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
  demoThumb: { width: 44, height: 44 },
  note: { fontFamily: Fonts.body, fontSize: 14, paddingVertical: 4 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  colSet: { width: 30, alignItems: 'center' },
  colPrev: { flex: 1.3, minWidth: 0 },
  colInput: { flex: 1, minWidth: 0 },
  colCheck: { width: 36 },
  colMedal: { width: 18, alignItems: 'center' },
  input: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    textAlign: 'center',
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
  },
  check: { height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  swipeDelete: { width: 64, marginLeft: Space.sm, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
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
  doneBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
