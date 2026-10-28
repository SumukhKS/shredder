import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedRef, useSharedValue } from 'react-native-reanimated';

import { Sortable } from '@/components/sortable';
import { StreakCard } from '@/components/streak-card';
import { ExerciseList } from '@/components/workout-card';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { ProgressBar, Ring } from '@/components/ui/progress';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Gradients, Radius, Space, withAlpha } from '@/constants/theme';
import { fetchDay, fetchHabitHistory, type Habit } from '@/lib/daily';
import { greeting, toDay } from '@/lib/dates';
import { HABITS } from '@/lib/habits';
import { backfillHealth, syncHealthThrottled } from '@/lib/health';
import { dayStreak, fetchWorkoutWeeks, weekStreaks } from '@/lib/streak';
import { useQuery } from '@/lib/use-query';
import { fetchWorkoutExercises } from '@/lib/workouts';
import { useSession } from '@/stores/session';
import {
  CARD_NAMES,
  TAB_NAMES,
  useTodayLayout,
  type CardId,
  type CardPref,
  type CardSize,
  type TabId,
} from '@/stores/today-layout';
import { completedSetCount, useWorkout } from '@/stores/workout';

async function loadToday(day: string) {
  const d = await fetchDay(day);
  return { ...d, exercises: await fetchWorkoutExercises(d.workouts.map((w) => w.id)) };
}

async function loadWeek(day: string) {
  const [water, steps, sleep] = await Promise.all([
    fetchHabitHistory('water', day),
    fetchHabitHistory('steps', day),
    fetchHabitHistory('sleep', day),
  ]);
  return { water, steps, sleep };
}

/** What a card shows at medium and small size. */
interface Summary {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  sub: string;
  progress?: number;
  lit: boolean;
}

export default function Today() {
  const c = useColors();
  const router = useRouter();
  const { profile, session } = useSession();
  const active = useWorkout((s) => s.active);
  const { cards: layout, toggle, setSize, setOrder, reset, hiddenTabs, toggleTab } = useTodayLayout();
  // Layout editing happens right here: hold a card to drag it, use its corner to resize it.
  const [editing, setEditing] = useState(false);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const today = toDay();
  const day = useQuery(() => loadToday(today), today);
  const week = useQuery(() => loadWeek(today), today);
  const weeks = useQuery(fetchWorkoutWeeks);
  const userId = session?.user.id;

  // Pull the last week of steps and sleep when the screen comes back into view (at most every
  // 15 minutes), and the whole past year the first time each session.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      syncHealthThrottled(userId, today)
        .then((synced) => (synced ? backfillHealth(userId, today).then(() => true) : false))
        .then((synced) => {
          if (synced) {
            day.reload();
            week.reload();
          }
        })
        .catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, today])
  );

  // Android back leaves layout editing instead of the screen.
  useFocusEffect(
    useCallback(() => {
      if (!editing) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setEditing(false);
        return true;
      });
      return () => sub.remove();
    }, [editing])
  );

  if (!profile || !session) return null;
  const d = day.data;
  const kcal = Math.round(d?.totals.kcal ?? 0);
  const remaining = profile.calorie_target - kcal;
  const synced = d?.health?.source === 'health_connect';
  const workouts = d?.workouts ?? [];
  const streaks = weeks.data ? weekStreaks(weeks.data) : undefined;
  const days = dayStreak(profile);
  const values: Record<Habit, number> = {
    water: d?.waterMl ?? 0,
    steps: d?.health?.steps ?? 0,
    sleep: d?.health?.sleep_min ?? 0,
  };

  const routes: Record<CardId, Href> = {
    streak: '/streaks',
    calories: '/fuel',
    water: { pathname: '/habit/[kind]', params: { kind: 'water' } },
    steps: { pathname: '/habit/[kind]', params: { kind: 'steps' } },
    sleep: { pathname: '/habit/[kind]', params: { kind: 'sleep' } },
    workout: '/workout/day',
  };

  function summary(id: CardId): Summary {
    switch (id) {
      case 'streak':
        return {
          icon: 'flame',
          title: 'Streaks',
          value: `${days} day${days === 1 ? '' : 's'}`,
          sub: `${streaks?.current ?? 0} week${streaks?.current === 1 ? '' : 's'} training`,
          lit: days > 0,
        };
      case 'calories':
        return {
          icon: 'restaurant',
          title: 'Calories',
          value: kcal.toLocaleString(),
          sub: `${Math.abs(remaining).toLocaleString()} kcal ${remaining >= 0 ? 'left' : 'over'}`,
          progress: kcal / profile!.calorie_target,
          lit: kcal > 0,
        };
      case 'workout':
        return {
          icon: 'barbell',
          title: 'Workout',
          value: workouts.length ? workouts.map((w) => w.name).join(', ') : active ? active.name : 'Not yet',
          sub: workouts.length
            ? workouts
                .flatMap((w) => d?.exercises[w.id] ?? [])
                .map((e) => e.name)
                .join(', ') || 'Done today'
            : active
              ? `In progress, ${completedSetCount(active)} sets`
              : 'Nothing logged today',
          progress: workouts.length ? 1 : 0,
          lit: workouts.length > 0 || !!active,
        };
      default: {
        const meta = HABITS[id];
        const target = meta.target(profile!);
        return {
          icon: meta.icon,
          title: meta.title,
          value: meta.format(values[id]),
          sub: `of ${meta.format(target)}`,
          progress: target ? values[id] / target : 0,
          lit: values[id] > 0,
        };
      }
    }
  }

  function large(id: CardId, onPress?: () => void) {
    switch (id) {
      case 'streak':
        return <StreakCard profile={profile!} weeks={streaks} onPress={onPress} />;
      case 'calories':
        return (
          <Card onPress={onPress} style={{ gap: Space.lg }}>
            <View style={styles.row}>
              <Ring value={kcal / profile!.calorie_target} color={c.primary} size={104} stroke={12}>
                <AppText variant="stat" style={{ fontSize: 22 }}>
                  {Math.abs(remaining).toLocaleString()}
                </AppText>
                <AppText variant="small" color="textMuted" style={{ fontSize: 11 }}>
                  {remaining >= 0 ? 'kcal left' : 'kcal over'}
                </AppText>
              </Ring>
              <View style={{ flex: 1, gap: Space.sm }}>
                <AppText variant="h3">
                  {kcal.toLocaleString()} of {profile!.calorie_target.toLocaleString()} kcal
                </AppText>
                <MacroBar label="Protein" value={d?.totals.protein ?? 0} target={profile!.protein_g} color={c.protein} />
                <MacroBar label="Carbs" value={d?.totals.carbs ?? 0} target={profile!.carbs_g} color={c.carbs} />
                <MacroBar label="Fat" value={d?.totals.fat ?? 0} target={profile!.fat_g} color={c.fat} />
              </View>
            </View>
            <Button label="Log food" icon="add" variant="secondary" onPress={() => router.push('/food/search')} />
          </Card>
        );
      case 'workout':
        return (
          <Card onPress={onPress} style={{ gap: Space.md }}>
            <View style={styles.row}>
              <IconTile icon="barbell" size={36} off={!workouts.length && !active} />
              <View style={{ flex: 1 }}>
                <AppText variant="h3">Workout</AppText>
                <AppText variant="small" color="textMuted">
                  {workouts.length ? 'Done today' : active ? 'In progress' : 'Nothing logged yet today'}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
            </View>
            {active ? (
              <View style={[styles.workout, { borderColor: c.hairline }]}>
                <AppText variant="h3" numberOfLines={1}>
                  {active.name}
                </AppText>
                <ExerciseList
                  exercises={active.exercises.slice(0, 3).map((e) => ({
                    name: e.exercise.name,
                    kind: e.exercise.kind,
                    gif_id: e.exercise.gif_id,
                    exercise_id: e.exercise.id,
                    sets: e.sets
                      .filter((s) => s.done)
                      .map((s) => ({
                        set_type: s.setType,
                        weight_kg: Number(s.weight) || null,
                        reps: Number(s.reps) || null,
                        duration_s: null,
                        distance_m: null,
                      })),
                  }))}
                  more={Math.max(0, active.exercises.length - 3)}
                />
              </View>
            ) : null}
            {workouts.map((w) => {
              const list = d?.exercises[w.id] ?? [];
              return (
                <View key={w.id} style={[styles.workout, { borderColor: c.hairline }]}>
                  <AppText variant="h3" numberOfLines={2}>
                    {w.name}
                  </AppText>
                  <ExerciseList exercises={list.slice(0, 3)} more={list.length - Math.min(list.length, 3)} />
                </View>
              );
            })}
          </Card>
        );
      default:
        return (
          <HabitCard
            kind={id}
            value={values[id]}
            target={HABITS[id].target(profile!)}
            week={week.data?.[id].map((p) => p.value)}
            note={
              id === 'water'
                ? 'Tap to add a drink or set the day’s total'
                : synced
                  ? 'Synced from Health Connect'
                  : 'Connect a device to see this'
            }
            onPress={onPress}
          />
        );
    }
  }

  const shown = layout.filter((p) => p.visible);
  const hidden = layout.filter((p) => !p.visible);

  function render(p: CardPref) {
    // While editing, taps belong to the edit controls, not the card.
    const onPress = editing ? undefined : () => router.push(routes[p.id]);
    if (p.size === 'large') return large(p.id, onPress);
    const s = summary(p.id);
    return p.size === 'medium' ? <RowCard s={s} onPress={onPress} /> : <TileCard s={s} onPress={onPress} />;
  }

  return (
    <Screen
      scrollRef={scrollRef}
      refreshing={day.refreshing}
      onRefresh={() => {
        day.refresh();
        week.reload();
        weeks.reload();
        syncHealthThrottled(session.user.id, today, true).then((ok) => {
          if (ok) day.reload();
        });
      }}>
      {editing ? (
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="h1">Customize layout</AppText>
            <AppText variant="small" color="textMuted">
              Hold a card and drag it to move it. Drag its corner to resize it, or tap the corner to switch sizes.
            </AppText>
          </View>
          <Button label="Done" size="sm" onPress={() => setEditing(false)} />
        </View>
      ) : (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText variant="body" color="textMuted">
              {greeting()},
            </AppText>
            <AppText variant="h1">{profile.display_name ?? 'athlete'}</AppText>
          </View>
          <IconButton icon="settings-outline" label="Goals and settings" onPress={() => router.push('/settings')} />
        </View>
      )}

      <Animated.View entering={FadeIn.duration(350)}>
        <Sortable
          items={shown}
          keyOf={cardKey}
          span={cardSpan}
          gap={Space.md}
          scrollRef={scrollRef}
          // Cards only move after "Customize layout" is tapped, so a long press on a card can't rearrange it by mistake.
          enabled={editing}
          onReorder={(keys) => setOrder(keys as CardId[])}
          renderItem={(p) => (
            <View>
              <View pointerEvents={editing ? 'none' : 'auto'}>{render(p)}</View>
              {editing ? (
                <EditControls
                  name={CARD_NAMES[p.id]}
                  size={p.size}
                  onHide={() => toggle(p.id)}
                  onResize={(s) => setSize(p.id, s)}
                />
              ) : null}
            </View>
          )}
        />
      </Animated.View>

      {editing && hidden.length ? (
        <View style={{ gap: Space.sm }}>
          <AppText variant="h3">Hidden cards</AppText>
          <View style={styles.hidden}>
            {hidden.map((p) => (
              <Button key={p.id} label={CARD_NAMES[p.id]} icon="add" variant="secondary" size="sm" onPress={() => toggle(p.id)} />
            ))}
          </View>
        </View>
      ) : null}

      {editing ? (
        <View style={{ gap: Space.sm }}>
          <AppText variant="h3">Bottom bar</AppText>
          <AppText variant="small" color="textMuted">
            Turn tabs on or off. Today always stays.
          </AppText>
          <View style={styles.hidden}>
            {(Object.keys(TAB_NAMES) as TabId[]).map((id) => {
              const on = !hiddenTabs.includes(id);
              return (
                <Button
                  key={id}
                  label={TAB_NAMES[id]}
                  icon={on ? 'checkmark' : 'add'}
                  variant={on ? 'primary' : 'secondary'}
                  size="sm"
                  onPress={() => toggleTab(id)}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {shown.length === 0 && !editing ? (
        <AppText color="textMuted" align="center">
          Every card is hidden. Tap Customize layout to bring some back.
        </AppText>
      ) : null}
      {editing ? (
        <Button label="Reset layout" icon="refresh" variant="ghost" onPress={reset} />
      ) : (
        <Button label="Customize layout" icon="grid-outline" variant="ghost" onPress={() => setEditing(true)} />
      )}
    </Screen>
  );
}

const cardKey = (p: CardPref) => p.id;
const cardSpan = (p: CardPref) => (p.size === 'small' ? 0.5 : 1);

const SIZE_NAMES: Record<CardSize, string> = { small: 'Small', medium: 'Wide', large: 'Large' };
const NEXT_SIZE: Record<CardSize, CardSize> = { small: 'medium', medium: 'large', large: 'small' };

/** Size after dragging the corner by (dx, dy): right or left widens or narrows, down or up grows or shrinks. */
function resized(from: CardSize, dx: number, dy: number): CardSize {
  const wide = Math.max(0, Math.min(1, (from === 'small' ? 0 : 1) + (dx > 40 ? 1 : dx < -40 ? -1 : 0)));
  const tall = Math.max(0, Math.min(1, (from === 'large' ? 1 : 0) + (dy > 60 ? 1 : dy < -60 ? -1 : 0)));
  if (tall) return 'large';
  return wide ? 'medium' : 'small';
}

/** Hide button and resize corner drawn over a card while the layout is being edited. */
function EditControls({
  name,
  size,
  onHide,
  onResize,
}: {
  name: string;
  size: CardSize;
  onHide: () => void;
  onResize: (s: CardSize) => void;
}) {
  const c = useColors();
  // Size when the drag began, and the last size applied during it.
  const start = useSharedValue<CardSize>(size);
  const last = useSharedValue<CardSize>(size);
  const resize = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onStart(() => {
      start.set(size);
      last.set(size);
    })
    .onUpdate((e) => {
      const next = resized(start.get(), e.translationX, e.translationY);
      if (next !== last.get()) {
        last.set(next);
        onResize(next);
      }
    })
    .onEnd((e) => {
      // A tap (no real drag) steps through the sizes instead.
      if (Math.abs(e.translationX) < 8 && Math.abs(e.translationY) < 8) onResize(NEXT_SIZE[start.get()]);
    });

  return (
    <>
      <View pointerEvents="none" style={[styles.outline, { borderColor: withAlpha(c.primary, 0.7) }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Hide ${name}`}
        hitSlop={10}
        onPress={onHide}
        style={[styles.hide, { backgroundColor: c.surfaceHi, borderColor: c.border }]}>
        <Ionicons name="remove" size={18} color={c.text} />
      </Pressable>
      <GestureDetector gesture={resize}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${name} size: ${SIZE_NAMES[size]}. Drag or tap to resize.`}
          hitSlop={10}
          style={[styles.resize, { backgroundColor: c.primary }]}>
          <Ionicons name="resize" size={16} color={c.onPrimary} />
        </View>
      </GestureDetector>
    </>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.row}>
        <AppText variant="small" color="textMuted" style={{ flex: 1 }}>
          {label}
        </AppText>
        <AppText variant="smallBold">
          {Math.round(value)} / {target} g
        </AppText>
      </View>
      <ProgressBar value={value / target} color={color} height={6} />
    </View>
  );
}

/** Medium: one full-width row. */
function RowCard({ s, onPress }: { s: Summary; onPress?: () => void }) {
  const c = useColors();
  return (
    <Card onPress={onPress} style={styles.row}>
      {s.progress !== undefined ? (
        <Ring value={s.progress} color={c.primary} size={56} stroke={7}>
          <Ionicons name={s.icon} size={20} color={s.lit ? c.text : c.textMuted} />
        </Ring>
      ) : (
        <IconTile icon={s.icon} size={48} off={!s.lit} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="smallBold" color="textMuted">
          {s.title}
        </AppText>
        <AppText variant="h2" numberOfLines={1}>
          {s.value}
        </AppText>
        <AppText variant="small" color="textMuted" numberOfLines={1}>
          {s.sub}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </Card>
  );
}

/** Small: a half-width tile. */
function TileCard({ s, onPress }: { s: Summary; onPress?: () => void }) {
  const c = useColors();
  return (
    <Card onPress={onPress} style={styles.tile}>
      <View style={styles.row}>
        <IconTile icon={s.icon} size={30} off={!s.lit} />
        <AppText variant="smallBold" color="textMuted" style={{ flex: 1 }} numberOfLines={1}>
          {s.title}
        </AppText>
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="stat" numberOfLines={1} adjustsFontSizeToFit>
          {s.value}
        </AppText>
        <AppText variant="small" color="textMuted" numberOfLines={2}>
          {s.sub}
        </AppText>
      </View>
      {s.progress !== undefined ? <ProgressBar value={s.progress} color={c.primary} height={6} /> : null}
    </Card>
  );
}

/** Large habit card: today's value against the goal, plus the last 7 days as mini bars. */
function HabitCard({
  kind,
  value,
  target,
  week,
  note,
  onPress,
}: {
  kind: Habit;
  value: number;
  target: number;
  week?: number[];
  note: string;
  onPress?: () => void;
}) {
  const c = useColors();
  const meta = HABITS[kind];
  const pct = target ? value / target : 0;
  return (
    <Card onPress={onPress} style={{ gap: Space.md }}>
      <View style={styles.row}>
        <Ring value={pct} color={c.primary} size={76} stroke={9}>
          <Ionicons name={meta.icon} size={24} color={pct > 0 ? c.text : c.textMuted} />
        </Ring>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="smallBold" color="textMuted">
            {meta.title}
          </AppText>
          <AppText variant="h1" numberOfLines={1} adjustsFontSizeToFit>
            {meta.format(value)}
          </AppText>
          <AppText variant="small" color="textMuted">
            of {meta.format(target)}, {Math.round(pct * 100)}%
          </AppText>
        </View>
        {week ? <MiniBars values={week} target={target} /> : null}
      </View>
      <View style={styles.row}>
        <AppText variant="small" color="textMuted" style={{ flex: 1 }}>
          {note}
        </AppText>
        {pct >= 1 ? <Ionicons name="checkmark-circle" size={20} color={c.success} /> : null}
        <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
      </View>
    </Card>
  );
}

/** Seven slim bars: today's glows, goal days are lit, the rest dim. */
function MiniBars({ values, target }: { values: number[]; target: number }) {
  const c = useColors();
  const max = Math.max(target, ...values, 1);
  return (
    <View style={styles.bars} accessibilityLabel="Last 7 days">
      {values.map((v, i) => {
        const h = Math.max(4, (v / max) * 40);
        const last = i === values.length - 1;
        return last ? (
          <LinearGradient key={i} colors={Gradients.blaze} style={[styles.bar, { height: h }]} />
        ) : (
          <View key={i} style={[styles.bar, { height: h, backgroundColor: target && v >= target ? c.accent : c.border }]} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  hidden: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  outline: { ...StyleSheet.absoluteFill, borderRadius: Radius.card, borderWidth: 2, borderStyle: 'dashed' },
  hide: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resize: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: { gap: Space.md, minHeight: 150, justifyContent: 'space-between' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 40 },
  bar: { width: 6, borderRadius: 3 },
  workout: { gap: Space.sm, borderTopWidth: 1, paddingTop: Space.md },
});
