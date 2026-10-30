import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BarChart } from '@/components/charts';
import { SleepStages, StepsByHour } from '@/components/health-detail';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { IconTile } from '@/components/ui/icon-tile';
import { Ring } from '@/components/ui/progress';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { SwipeDays } from '@/components/swipe-days';
import { Radius, Space } from '@/constants/theme';
import { addWater, fetchDay, fetchHabitHistory, setWaterTotal, undoWater, type Habit, withWaiting } from '@/lib/daily';
import { dayLabel, addDays, fromDay, mondayOf, toDay } from '@/lib/dates';
import { HABITS, isHabit } from '@/lib/habits';
import { backfillHealth, connectHealth, healthStatus, syncHealth, type HealthStatus } from '@/lib/health';
import { refreshStreaks } from '@/lib/streak';
import { useQuery } from '@/lib/use-query';
import { useSession } from '@/stores/session';

const DRINKS = [
  { ml: 250, label: 'Glass' },
  { ml: 500, label: 'Bottle' },
  { ml: 750, label: 'Large bottle' },
  { ml: 1000, label: 'Litre' },
];

/** Full-screen view of one daily habit: the day's progress, logging, device sync and the last week. */
export default function HabitScreen() {
  const params = useLocalSearchParams<{ kind: string; day?: string }>();
  const kind: Habit = isHabit(params.kind) ? params.kind : 'water';
  const meta = HABITS[kind];
  const c = useColors();
  const { profile, session } = useSession();
  const [day, setDay] = useState(params.day ?? toDay());
  const snap = useQuery(() => fetchDay(day), day, { overlay: withWaiting });
  const week = useQuery(() => fetchHabitHistory(kind, day), `${kind}${day}`);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const userId = session?.user.id;

  function reload() {
    snap.reload();
    week.reload();
  }

  // Steps and sleep: check the device link, pull the past year once per session, and refresh
  // the week of the day being looked at.
  useEffect(() => {
    if (kind === 'water' || !userId) return;
    healthStatus()
      .then(async (s) => {
        setHealth(s);
        if (s !== 'connected') return;
        await backfillHealth(userId, toDay());
        const sunday = addDays(mondayOf(day), 6);
        if (await syncHealth(userId, sunday < toDay() ? sunday : toDay(), 7)) reload();
      })
      .catch(() => setHealth('unsupported'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, userId, day]);

  if (!profile || !session) return null;
  const d = snap.data;
  const value = kind === 'water' ? (d?.waterMl ?? 0) : kind === 'steps' ? (d?.health?.steps ?? 0) : (d?.health?.sleep_min ?? 0);
  const target = meta.target(profile);
  const synced = d?.health?.source === 'health_connect';
  const pct = target ? value / target : 0;

  async function saved() {
    reload();
    await refreshStreaks();
  }

  async function add(ml: number) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addWater(day, ml);
    await saved();
  }

  async function connect() {
    setNote(null);
    const s = await connectHealth();
    setHealth(s);
    if (s === 'connected') {
      await backfillHealth(session!.user.id, toDay(), true);
      reload();
      setNote('Connected. Steps and sleep now sync each time you open the app.');
    } else if (s === 'not_installed' || s === 'needs_update') {
      setNote('Install or update Health Connect from the Play Store, then try again.');
    } else if (s === 'disconnected') {
      setNote('Allow steps and sleep in Health Connect to sync them.');
    }
  }

  const values = week.data?.map((p) => p.value) ?? [];
  const logged = values.filter((v) => v > 0);
  const average = logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : 0;
  const hits = values.filter((v) => target && v >= target).length;

  return (
    <Screen
      padTop={false}
      refreshing={snap.refreshing}
      onRefresh={() => {
        snap.refresh();
        week.reload();
      }}>
      <Stack.Screen options={{ title: meta.title }} />
      <AppText variant="h3" align="center">
        {dayLabel(day)}
      </AppText>
      <SwipeDays day={day} onChange={setDay}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <Card tone="hero" style={styles.hero}>
            <Ring value={pct} color={c.primary} size={210} stroke={16}>
              <IconTile icon={meta.icon} size={30} off={pct === 0} />
              <AppText variant="hero" style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
                {meta.format(value)}
              </AppText>
              <AppText variant="smallBold" color="textMuted">
                of {meta.format(target)}
              </AppText>
            </Ring>
            <AppText variant="bodyBold" color={pct >= 1 ? 'text' : 'textMuted'}>
              {pct >= 1 ? 'Goal hit. Nice work.' : `${Math.round(pct * 100)}% of your daily goal`}
            </AppText>
            {synced ? (
              <AppText variant="small" color="textMuted">
                Synced from Health Connect
              </AppText>
            ) : null}
          </Card>
        </Animated.View>

        {kind === 'steps' ? <StepsByHour key={`${day}-${health}`} day={day} /> : null}
        {kind === 'sleep' ? <SleepStages key={`${day}-${health}`} day={day} /> : null}

        {/* Steps and sleep come only from the apps linked through Health Connect, so they can't be typed in. */}
        {kind === 'water' ? (
          <Animated.View entering={FadeInDown.delay(80).duration(400)} style={{ gap: Space.lg }}>
            <SectionHeader title="Add a drink" />
            <View style={styles.grid}>
              {DRINKS.map((g) => (
                <Pressable
                  key={g.ml}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${g.ml} ml`}
                  onPress={() => add(g.ml)}
                  style={({ pressed }) => [
                    styles.drink,
                    { backgroundColor: c.surface, borderColor: c.border },
                    pressed && { transform: [{ scale: 0.96 }], backgroundColor: c.surfaceHi },
                  ]}>
                  <AppText variant="h2">+{g.ml >= 1000 ? `${g.ml / 1000} L` : `${g.ml} ml`}</AppText>
                  <AppText variant="small" color="textMuted">
                    {g.label}
                  </AppText>
                </Pressable>
              ))}
            </View>
            {value > 0 ? (
              <Button
                label="Undo last drink"
                icon="arrow-undo"
                variant="ghost"
                onPress={async () => {
                  undoWater(snap.data?.water ?? []);
                  await saved();
                }}
              />
            ) : null}
            <Entry
              key={`${day}-${value}`}
              label="Or set the whole day's total"
              suffix="litres"
              decimal
              max={15}
              initial={value ? String(Math.round(value / 10) / 100) : ''}
              onSave={async (litres) => {
                setWaterTotal(day, litres * 1000);
                await saved();
              }}
            />
          </Animated.View>
        ) : null}

        {/* Once Health Connect is linked the data just appears; the card only shows while something needs doing. */}
        {kind !== 'water' && health && health !== 'connected' && health !== 'unsupported' ? (
          <Card tone="flat" style={{ gap: Space.md }}>
            <AppText variant="bodyBold">{SYNC_LABELS[health]}</AppText>
            <AppText variant="small" color="textMuted">
              Fitbit, Samsung Health, Google Fit, Garmin and most smartwatches share {kind} through Health Connect.
            </AppText>
            {health === 'disconnected' || health === 'not_installed' || health === 'needs_update' ? (
              <Button label="Sync from a device or app" icon="watch-outline" variant="secondary" onPress={connect} />
            ) : null}
            {note ? (
              <AppText variant="small" color="textMuted">
                {note}
              </AppText>
            ) : null}
          </Card>
        ) : null}

        <Animated.View entering={FadeInDown.delay(160).duration(400)}>
          <Card style={{ gap: Space.md }}>
            <View style={styles.row}>
              <AppText variant="h3" style={{ flex: 1 }}>
                Last 7 days
              </AppText>
              <AppText variant="smallBold" color="textMuted">
                {hits}/7 goals hit
              </AppText>
            </View>
            <BarChart
              values={values}
              labels={week.data?.map((p) => fromDay(p.day).toLocaleDateString(undefined, { weekday: 'narrow' })) ?? []}
              color={c.primary}
            />
            <AppText variant="small" color="textMuted">
              Average {average ? meta.format(average) : '–'} on the days you logged
            </AppText>
          </Card>
        </Animated.View>
      </SwipeDays>
    </Screen>
  );
}

/** Number field with its own save button; remount it (via `key`) to reset the value. */
function Entry({
  label,
  suffix,
  initial,
  decimal,
  max,
  onSave,
}: {
  label: string;
  suffix: string;
  initial: string;
  decimal?: boolean;
  max?: number;
  onSave: (n: number) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(value.replace(',', '.'));
    if (value.trim() === '' || !Number.isFinite(n) || n < 0) return setError('Enter a number.');
    if (max !== undefined && n > max) return setError(`Enter ${suffix} between 0 and ${max}.`);
    setBusy(true);
    setError(null);
    try {
      await onSave(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <View style={styles.entry}>
      <View style={{ flex: 1 }}>
        <Field
          label={label}
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setError(null);
          }}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          suffix={suffix}
          error={error}
          onSubmitEditing={save}
        />
      </View>
      <Button label="Save" loading={busy} onPress={save} style={{ marginTop: 21 }} />
    </View>
  );
}

const SYNC_LABELS: Record<HealthStatus | 'checking', string> = {
  connected: 'Connected to Health Connect',
  disconnected: 'Not connected to a device',
  not_installed: 'Health Connect is not installed',
  needs_update: 'Health Connect needs an update',
  unsupported: 'Device sync works on Android phones',
  checking: 'Checking device sync...',
};

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Space.md },
  value: { marginTop: Space.sm, maxWidth: 160 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
  drink: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: Radius.card,
    paddingVertical: Space.lg,
    alignItems: 'center',
    gap: 2,
  },
  entry: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
});
