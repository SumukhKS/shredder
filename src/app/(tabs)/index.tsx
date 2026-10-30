import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Sortable } from '@/components/sortable';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { ProgressBar, Ring } from '@/components/ui/progress';
import { LoadError, Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space, withAlpha } from '@/constants/theme';
import { fetchDay, withWaiting, type Habit } from '@/lib/daily';
import { formatDuration, greeting, toDay } from '@/lib/dates';
import { HABITS } from '@/lib/habits';
import { backfillHealth, syncHealthThrottled } from '@/lib/health';
import { supabase } from '@/lib/supabase';
import { resumeStepSensor } from '@/lib/step-sensor';
import { useAppSettings } from '@/stores/app-settings';
import { formatVolume, useUnits } from '@/lib/units';
import { useQuery } from '@/lib/use-query';
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
import { completedSetCount, liveVolume, useWorkout } from '@/stores/workout';

async function loadWeek(day: string) {
  const { data, error } = await supabase.rpc('habit_week', { p_end: day });
  if (error) throw error;
  const rows = data as { day: string; water: number; steps: number; sleep: number }[];
  const series = (key: 'water' | 'steps' | 'sleep') => rows.map((r) => ({ day: r.day, value: Number(r[key]) }));
  return { water: series('water'), steps: series('steps'), sleep: series('sleep') };
}

/** What a card shows at medium and small size. */
interface Summary {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  sub?: string;
  progress?: number;
  lit: boolean;
}

export default function Today() {
  const c = useColors();
  const router = useRouter();
  const { profile, session } = useSession();
  const active = useWorkout((s) => s.active);
  const startWorkout = useWorkout((s) => s.start);
  const units = useUnits();
  const { cards: layout, toggle, setSize, setOrder, reset, hiddenTabs, toggleTab } = useTodayLayout();
  // Layout editing happens right here: hold a card to drag it, use its corner to resize it.
  const [editing, setEditing] = useState(false);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const today = toDay();
  const day = useQuery(() => fetchDay(today), today, { cache: 'today', overlay: withWaiting });
  const week = useQuery(() => loadWeek(today), today, { cache: 'today-week' });
  const userId = session?.user.id;

  // Pull the last week of steps and sleep when the screen comes back into view (at most every
  // 15 minutes), and the whole past year the first time each session.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (useAppSettings.getState().stepsSource === 'phone_sensor') resumeStepSensor().catch(() => null);
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
  const workouts = d?.workouts ?? [];
  const values: Record<Habit, number> = {
    water: d?.waterMl ?? 0,
    steps: d?.health?.steps ?? 0,
    sleep: d?.health?.sleep_min ?? 0,
  };

  const routes: Record<CardId, Href> = {
    calories: '/fuel',
    water: { pathname: '/habit/[kind]', params: { kind: 'water' } },
    steps: { pathname: '/habit/[kind]', params: { kind: 'steps' } },
    sleep: { pathname: '/habit/[kind]', params: { kind: 'sleep' } },
    workout: '/workout/day',
  };

  function summary(id: CardId): Summary {
    switch (id) {
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
          value: active ? active.name : workouts.length ? workouts.map((w) => w.name).join(', ') : 'Not yet',
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
      case 'calories':
        return (
          <LargeCard
            onPress={onPress}
            ring={kcal / profile!.calorie_target}
            value={Math.abs(remaining).toLocaleString()}
            unit={remaining >= 0 ? 'kcal left' : 'kcal over'}
            headline={`${kcal.toLocaleString()} of ${profile!.calorie_target.toLocaleString()} kcal`}
            rows={[
              macroRow('Protein', d?.totals.protein ?? 0, profile!.protein_g, c.protein),
              macroRow('Carbs', d?.totals.carbs ?? 0, profile!.carbs_g, c.carbs),
              macroRow('Fat', d?.totals.fat ?? 0, profile!.fat_g, c.fat),
            ]}
            action="Log food"
            actionIcon="add"
            onAction={() => router.push('/food/search')}
          />
        );
      case 'workout': {
        const sets = workouts.reduce((n, w) => n + w.total_sets, 0) + completedSetCount(active);
        const volume = workouts.reduce((v, w) => v + Number(w.total_volume), 0) + liveVolume(active);
        const seconds = workouts.reduce((t, w) => t + w.duration_s, 0);
        const count = workouts.length + (active ? 1 : 0);
        return (
          <LargeCard
            onPress={onPress}
            ring={count ? 1 : 0}
            value={String(count)}
            unit={count === 1 ? 'workout' : 'workouts'}
            headline={active ? active.name : workouts.length ? workouts.map((w) => w.name).join(', ') : 'No workout yet today'}
            rows={[
              { label: 'Sets', value: sets.toLocaleString(), progress: sets ? 1 : 0, color: c.primary },
              { label: 'Volume', value: formatVolume(volume, units.weight), progress: volume ? 1 : 0, color: c.primary },
              { label: 'Duration', value: formatDuration(seconds), progress: seconds ? 1 : 0, color: c.primary },
            ]}
            action={active ? 'Resume workout' : 'Start workout'}
            actionIcon={active ? 'play' : 'add'}
            onAction={() => {
              if (!active) startWorkout();
              router.push('/workout/active');
            }}
          />
        );
      }
      default: {
        const meta = HABITS[id];
        const target = meta.target(profile!);
        const last7 = week.data?.[id].map((p) => p.value) ?? [];
        const average = last7.length ? last7.reduce((a, b) => a + b, 0) / last7.length : 0;
        const atGoal = target ? last7.filter((v) => v >= target).length : 0;
        const pct = target ? values[id] / target : 0;
        return (
          <LargeCard
            onPress={onPress}
            ring={pct}
            value={`${Math.round(pct * 100)}%`}
            unit="of goal"
            headline={`${meta.format(values[id])} of ${meta.format(target)}`}
            rows={[
              { label: 'Today', value: meta.format(values[id]), progress: pct, color: c.primary },
              {
                label: '7-day average',
                value: meta.format(Math.round(average)),
                progress: target ? average / target : 0,
                color: c.primary,
              },
              { label: 'Days at goal', value: `${atGoal} of 7`, progress: atGoal / 7, color: c.primary },
            ]}
            action={id === 'water' ? 'Add water' : id === 'steps' ? 'View steps' : 'View sleep'}
            actionIcon={id === 'water' ? 'add' : 'chevron-forward'}
            onAction={() => router.push(routes[id])}
          />
        );
      }
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
        syncHealthThrottled(session.user.id, today, true).then((ok) => {
          if (ok) day.reload();
        });
      }}>
      <LoadError q={day} what="today" />
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
          <IconButton icon="calendar-outline" label="Calendar" onPress={() => router.push('/calendar')} />
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
          renderItem={(p) =>
            editing ? (
              <Floating phase={shown.indexOf(p)}>
                <View pointerEvents="none">{render(p)}</View>
                <EditControls
                  name={CARD_NAMES[p.id]}
                  size={p.size}
                  onHide={() => toggle(p.id)}
                  onResize={(s) => setSize(p.id, s)}
                />
              </Floating>
            ) : (
              render(p)
            )
          }
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

/**
 * While the layout is being edited, each card lifts off the page and bobs gently, out of step
 * with its neighbours, so it's clear the cards can be moved.
 */
function Floating({ phase, children }: { phase: number; children: React.ReactNode }) {
  const c = useColors();
  const lift = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    lift.set(withSpring(1, { damping: 14, stiffness: 180 }));
    bob.set(
      withDelay(
        (phase % 4) * 220,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) })
          ),
          -1
        )
      )
    );
  }, [lift, bob, phase]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -4 * lift.get() - 3 * bob.get() }, { scale: 1 + 0.015 * lift.get() }],
  }));
  // A shadow alone vanishes on black, so the lifted card casts a soft orange glow instead.
  return (
    <Animated.View style={[styles.floating, { boxShadow: `0px 12px 26px 0px ${withAlpha(c.primary, 0.28)}` }, style]}>
      {children}
    </Animated.View>
  );
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

const macroRow = (label: string, value: number, target: number, color: string): LargeRow => ({
  label,
  value: `${Math.round(value)} / ${target} g`,
  progress: value / target,
  color,
});

interface LargeRow {
  label: string;
  value: string;
  progress: number;
  color: string;
}

/** Large: the same layout for every card, with a ring, a headline, three rows and one action. */
function LargeCard({
  ring,
  value,
  unit,
  headline,
  rows,
  action,
  actionIcon,
  onAction,
  onPress,
}: {
  ring: number;
  value: string;
  unit: string;
  headline: string;
  rows: LargeRow[];
  action: string;
  actionIcon: keyof typeof Ionicons.glyphMap;
  onAction: () => void;
  onPress?: () => void;
}) {
  const c = useColors();
  return (
    <Card onPress={onPress} style={{ gap: Space.lg }}>
      <View style={styles.row}>
        <Ring value={ring} color={c.primary} size={104} stroke={12}>
          <AppText variant="stat" style={{ fontSize: 22 }} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </AppText>
          <AppText variant="small" color="textMuted" style={{ fontSize: 11 }}>
            {unit}
          </AppText>
        </Ring>
        <View style={{ flex: 1, gap: Space.sm }}>
          <AppText variant="h3" numberOfLines={2}>
            {headline}
          </AppText>
          {rows.map((r) => (
            <View key={r.label} style={{ gap: 4 }}>
              <View style={styles.row}>
                <AppText variant="small" color="textMuted" style={{ flex: 1 }}>
                  {r.label}
                </AppText>
                <AppText variant="smallBold">{r.value}</AppText>
              </View>
              <ProgressBar value={r.progress} color={r.color} height={6} />
            </View>
          ))}
        </View>
      </View>
      <Button label={action} icon={actionIcon} variant="secondary" onPress={onAction} />
    </Card>
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
        {s.sub ? (
          <AppText variant="small" color="textMuted" numberOfLines={1}>
            {s.sub}
          </AppText>
        ) : null}
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
        {s.sub ? (
          <AppText variant="small" color="textMuted" numberOfLines={2}>
            {s.sub}
          </AppText>
        ) : null}
      </View>
      {s.progress !== undefined ? <ProgressBar value={s.progress} color={c.primary} height={6} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  hidden: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  floating: { borderRadius: Radius.card },
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
});
