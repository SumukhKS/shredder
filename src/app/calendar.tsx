import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { WorkoutCard } from '@/components/workout-card';
import { IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { LoadError, Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space, withAlpha } from '@/constants/theme';
import { fetchDay, withWaiting } from '@/lib/daily';
import { addDays, firstOfMonth, formatTimeShort, fromDay, mondayOf, toDay } from '@/lib/dates';
import { HABITS } from '@/lib/habits';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { formatVolume, formatWeight, useUnits } from '@/lib/units';
import { fetchWorkoutExercises } from '@/lib/workouts';
import { useSession } from '@/stores/session';
import type { Meal } from '@/types/db';

const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];

/** Days in a month with anything logged, and days with a workout. */
async function fetchMonth(month: string) {
  const end = addDays(firstOfMonth(addDays(month, 32)), -1);
  const [logged, trained] = await Promise.all([
    supabase.from('xp_events').select('day').gte('day', month).lte('day', end).limit(5000),
    supabase.from('workouts').select('day').gte('day', month).lte('day', end),
  ]);
  return {
    logged: new Set((logged.data ?? []).map((r) => r.day as string)),
    trained: new Set((trained.data ?? []).map((r) => r.day as string)),
  };
}

/** Everything logged on one day: food, water, steps, sleep, weight and workouts. */
async function fetchDaySummary(day: string) {
  const [snap, weight] = await Promise.all([
    fetchDay(day),
    supabase.from('body_metrics').select('weight_kg, body_fat_pct').eq('day', day).maybeSingle(),
  ]);
  const exercises = await fetchWorkoutExercises(snap.workouts.map((w) => w.id));
  return {
    ...snap,
    exercises,
    weight: weight.data as { weight_kg: number | null; body_fat_pct: number | null } | null,
  };
}

/** A month calendar; tapping a day shows its whole summary underneath. */
export default function Calendar() {
  const c = useColors();
  const router = useRouter();
  const profile = useSession((s) => s.profile);
  const units = useUnits();
  const today = toDay();
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(firstOfMonth(today));
  const marks = useQuery(() => fetchMonth(month), month);
  const summary = useQuery(() => fetchDaySummary(day), day, { overlay: withWaiting });
  if (!profile) return null;

  // Six rows from the Monday on or before the 1st.
  const gridStart = mondayOf(month);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const rows = cells[35].slice(0, 7) === month.slice(0, 7) ? 6 : 5;
  const thisMonth = firstOfMonth(today);
  const s = summary.data;

  return (
    <Screen
      padTop={false}
      refreshing={summary.refreshing}
      onRefresh={() => {
        summary.refresh();
        marks.reload();
      }}>
      <LoadError q={summary} what="this day" />
      <Card style={{ gap: Space.md }}>
        <View style={styles.monthRow}>
          <IconButton icon="chevron-back" label="Previous month" onPress={() => setMonth(firstOfMonth(addDays(month, -1)))} />
          <AppText variant="h3" align="center" style={{ flex: 1 }}>
            {fromDay(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </AppText>
          {month < thisMonth ? (
            <IconButton icon="chevron-forward" label="Next month" onPress={() => setMonth(firstOfMonth(addDays(month, 32)))} />
          ) : (
            <View style={{ width: 30 }} />
          )}
        </View>
        <View style={styles.week}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
            <AppText key={i} variant="smallBold" color="textMuted" align="center" style={styles.cellBox}>
              {l}
            </AppText>
          ))}
        </View>
        {Array.from({ length: rows }, (_, r) => (
          <View key={r} style={styles.week}>
            {cells.slice(r * 7, r * 7 + 7).map((d) => {
              const inMonth = d.slice(0, 7) === month.slice(0, 7);
              const future = d > today;
              const trained = marks.data?.trained.has(d);
              const logged = marks.data?.logged.has(d);
              const selected = d === day;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: future }}
                  accessibilityLabel={`${fromDay(d).toDateString()}${trained ? ', trained' : logged ? ', logged' : ''}`}
                  disabled={future}
                  onPress={() => {
                    setDay(d);
                    if (!inMonth) setMonth(firstOfMonth(d));
                  }}
                  style={[styles.cellBox, { opacity: inMonth ? (future ? 0.3 : 1) : 0.35 }]}>
                  <View
                    style={[
                      styles.cell,
                      {
                        backgroundColor: trained ? c.primary : logged ? withAlpha(c.primary, 0.22) : 'transparent',
                        borderColor: selected ? c.text : 'transparent',
                      },
                    ]}>
                    <AppText
                      variant="bodyBold"
                      color={trained ? 'onPrimary' : d === today ? 'primary' : inMonth ? 'text' : 'textMuted'}>
                      {fromDay(d).getDate()}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={styles.legend}>
          <Legend color={c.primary} label="Workout" />
          <Legend color={withAlpha(c.primary, 0.22)} label="Logged something" />
        </View>
      </Card>

      <SectionHeader title={fromDay(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} />

      {s ? (
        <Animated.View key={day} entering={FadeIn.duration(250)} style={{ gap: Space.lg }}>
          <View style={styles.tiles}>
            {(['water', 'steps', 'sleep'] as const).map((h) => {
              const meta = HABITS[h];
              const value = h === 'water' ? s.waterMl : h === 'steps' ? (s.health?.steps ?? 0) : (s.health?.sleep_min ?? 0);
              const target = meta.target(profile);
              return (
                <Card
                  key={h}
                  style={styles.tile}
                  onPress={() => router.push({ pathname: '/habit/[kind]', params: { kind: h, day } })}>
                  <View style={styles.row}>
                    <Ionicons name={meta.icon} size={16} color={value > 0 ? c.primary : c.textMuted} />
                    <AppText variant="smallBold" color="textMuted">
                      {meta.title}
                    </AppText>
                  </View>
                  <AppText variant="h3" numberOfLines={1} adjustsFontSizeToFit>
                    {value ? meta.format(value) : '–'}
                  </AppText>
                  <ProgressBar value={target ? value / target : 0} color={c.primary} height={5} />
                </Card>
              );
            })}
          </View>

          <Card style={{ gap: Space.md }} onPress={() => router.push({ pathname: '/food/day', params: { day } })}>
            <View style={styles.row}>
              <Ionicons name="restaurant" size={18} color={s.logs.length ? c.primary : c.textMuted} />
              <AppText variant="h3" style={{ flex: 1 }}>
                Food
              </AppText>
              <AppText variant="bodyBold">
                {Math.round(s.totals.kcal).toLocaleString()} / {profile.calorie_target.toLocaleString()} kcal
              </AppText>
            </View>
            {s.logs.length ? (
              <>
                <AppText variant="small" color="textMuted">
                  Protein {Math.round(s.totals.protein)} g, carbs {Math.round(s.totals.carbs)} g, fat {Math.round(s.totals.fat)} g
                </AppText>
                {MEALS.map(({ id, label }) => {
                  const items = s.logs.filter((l) => l.meal === id);
                  if (!items.length) return null;
                  const kcal = items.reduce((t, l) => t + Number(l.kcal), 0);
                  return (
                    <View key={id} style={[styles.meal, { borderColor: c.hairline }]}>
                      <View style={styles.row}>
                        <AppText variant="bodyBold" style={{ flex: 1 }}>
                          {label}
                        </AppText>
                        <AppText variant="small" color="textMuted">
                          {Math.round(kcal).toLocaleString()} kcal
                        </AppText>
                      </View>
                      <AppText variant="small" color="textMuted" numberOfLines={3}>
                        {items.map((l) => l.food_name).join(', ')}
                      </AppText>
                    </View>
                  );
                })}
              </>
            ) : (
              <AppText variant="small" color="textMuted">
                No food logged.
              </AppText>
            )}
          </Card>

          {s.weight?.weight_kg ? (
            <Card style={styles.row} onPress={() => router.push('/measurements')}>
              <Ionicons name="scale" size={18} color={c.primary} />
              <AppText variant="h3" style={{ flex: 1 }}>
                Weigh-in
              </AppText>
              <AppText variant="bodyBold">
                {formatWeight(s.weight.weight_kg, units.weight)}
                {s.weight.body_fat_pct ? `, ${Number(s.weight.body_fat_pct)}% fat` : ''}
              </AppText>
            </Card>
          ) : null}

          {s.workouts.length ? (
            <>
              <View style={styles.row}>
                <AppText variant="h3" style={{ flex: 1 }}>
                  {s.workouts.length === 1 ? 'Workout' : `${s.workouts.length} workouts`}
                </AppText>
                <AppText variant="small" color="textMuted">
                  {formatTimeShort(s.workouts.reduce((t, w) => t + w.duration_s, 0))},{' '}
                  {formatVolume(
                    s.workouts.reduce((t, w) => t + Number(w.total_volume), 0),
                    units.weight
                  )}
                </AppText>
              </View>
              {s.workouts.map((w) => (
                <WorkoutCard
                  key={w.id}
                  workout={w}
                  exercises={s.exercises[w.id]}
                  onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })}
                />
              ))}
            </>
          ) : (
            <Card tone="flat" style={styles.row}>
              <Ionicons name="barbell-outline" size={18} color={c.textMuted} />
              <AppText color="textMuted">No workout.</AppText>
            </Card>
          )}
        </Animated.View>
      ) : null}
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center' },
  week: { flexDirection: 'row' },
  cellBox: { flex: 1, alignItems: 'center' },
  cell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flexDirection: 'row', gap: Space.lg },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  tiles: { flexDirection: 'row', gap: Space.sm },
  tile: { flex: 1, padding: Space.md, gap: Space.xs },
  meal: { borderTopWidth: 1, paddingTop: Space.sm, gap: 2 },
});
