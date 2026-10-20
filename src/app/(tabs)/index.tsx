import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LevelCard } from '@/components/level-card';
import { NumberSheet } from '@/components/number-sheet';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar, Ring } from '@/components/ui/progress';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { celebrateXp } from '@/components/xp-toast';
import { Radius, Space } from '@/constants/theme';
import { addWater, fetchDay, saveHealth, undoWater } from '@/lib/daily';
import { greeting, toDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { XP_LABELS } from '@/lib/xp';
import { useSession } from '@/stores/session';
import { useWorkout } from '@/stores/workout';

export default function Today() {
  const c = useColors();
  const router = useRouter();
  const { profile, session } = useSession();
  const active = useWorkout((s) => s.active);
  const startWorkout = useWorkout((s) => s.start);
  const today = toDay();
  const day = useQuery(() => fetchDay(today), today);
  const xpFeed = useQuery(async () => {
    const { data } = await supabase
      .from('xp_events')
      .select('id, kind, amount, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    return (data ?? []) as { id: number; kind: string; amount: number; created_at: string }[];
  });
  const [sheet, setSheet] = useState<'steps' | 'sleep' | null>(null);
  const [waterBusy, setWaterBusy] = useState(false);

  if (!profile || !session) return null;
  const d = day.data;
  const kcal = Math.round(d?.totals.kcal ?? 0);
  const remaining = profile.calorie_target - kcal;
  const water = d?.waterMl ?? 0;
  const steps = d?.health?.steps ?? 0;
  const sleep = d?.health?.sleep_min ?? 0;

  async function water250(ml: number) {
    setWaterBusy(true);
    try {
      await addWater(today, ml);
      await day.reload();
      await celebrateXp();
      xpFeed.reload();
    } finally {
      setWaterBusy(false);
    }
  }

  async function begin() {
    if (!active) await startWorkout();
    router.push('/workout/active');
  }

  return (
    <Screen
      refreshing={day.refreshing}
      onRefresh={() => {
        day.refresh();
        xpFeed.reload();
      }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="body" color="textMuted">
            {greeting()},
          </AppText>
          <AppText variant="h1">{profile.display_name ?? 'athlete'}</AppText>
        </View>
        <IconButton icon="settings-outline" label="Goals and settings" onPress={() => router.push('/settings')} />
      </View>

      <LevelCard profile={profile} />

      {/* Calories */}
      <Card onPress={() => router.push('/fuel')} style={{ gap: Space.lg }}>
        <View style={styles.row}>
          <Ring value={kcal / profile.calorie_target} color={c.primary} size={96} stroke={12}>
            <AppText variant="stat" style={{ fontSize: 22 }}>
              {Math.abs(remaining).toLocaleString()}
            </AppText>
            <AppText variant="small" color="textMuted" style={{ fontSize: 11 }}>
              {remaining >= 0 ? 'left' : 'over'}
            </AppText>
          </Ring>
          <View style={{ flex: 1, gap: Space.sm }}>
            <AppText variant="h3">
              {kcal.toLocaleString()} of {profile.calorie_target.toLocaleString()} kcal
            </AppText>
            <MacroBar label="Protein" value={d?.totals.protein ?? 0} target={profile.protein_g} color={c.protein} />
            <MacroBar label="Carbs" value={d?.totals.carbs ?? 0} target={profile.carbs_g} color={c.carbs} />
            <MacroBar label="Fat" value={d?.totals.fat ?? 0} target={profile.fat_g} color={c.fat} />
          </View>
        </View>
        <Button label="Log food" icon="add" variant="secondary" onPress={() => router.push('/food/search')} />
      </Card>

      {/* Habits */}
      <View style={styles.grid}>
        <Habit
          icon="water"
          color={c.water}
          title="Water"
          value={`${(water / 1000).toFixed(water % 1000 === 0 ? 0 : 2)} L`}
          target={`of ${profile.water_ml_target / 1000} L`}
          progress={water / profile.water_ml_target}>
          <View style={{ flexDirection: 'row', gap: Space.xs }}>
            <MiniButton label="+250" disabled={waterBusy} onPress={() => water250(250)} />
            <MiniButton label="+500" disabled={waterBusy} onPress={() => water250(500)} />
            <MiniButton
              label="Undo"
              icon="arrow-undo"
              disabled={waterBusy || water === 0}
              onPress={async () => {
                await undoWater(today);
                day.reload();
              }}
            />
          </View>
        </Habit>
        <Habit
          icon="footsteps"
          color={c.steps}
          title="Steps"
          value={steps.toLocaleString()}
          target={`of ${profile.steps_target.toLocaleString()}`}
          progress={steps / profile.steps_target}
          onPress={() => setSheet('steps')}
        />
        <Habit
          icon="moon"
          color={c.sleep}
          title="Sleep"
          value={sleep ? `${Math.floor(sleep / 60)}h ${sleep % 60}m` : '–'}
          target={`of ${profile.sleep_min_target / 60} h`}
          progress={sleep / profile.sleep_min_target}
          onPress={() => setSheet('sleep')}
        />
        <Habit
          icon="barbell"
          color={c.xp}
          title="Workout"
          value={d?.workedOut ? 'Done' : active ? 'In progress' : 'Not yet'}
          target={d?.workedOut ? 'XP banked' : 'Up to 200 XP'}
          progress={d?.workedOut ? 1 : 0}
          onPress={begin}
        />
      </View>

      {xpFeed.data && xpFeed.data.length > 0 ? (
        <>
          <SectionHeader title="Recent XP" />
          <Card tone="flat" style={{ gap: Space.md }}>
            {xpFeed.data.map((e) => (
              <View key={e.id} style={styles.row}>
                <AppText variant="body" style={{ flex: 1 }}>
                  {XP_LABELS[e.kind] ?? e.kind}
                </AppText>
                <AppText variant="bodyBold" color="xp">
                  +{e.amount}
                </AppText>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <NumberSheet
        visible={sheet === 'steps'}
        title="Steps today"
        suffix="steps"
        hint="Automatic sync with Apple Health and Health Connect is coming next."
        initial={steps ? String(steps) : ''}
        onClose={() => setSheet(null)}
        onSave={async (n) => {
          await saveHealth(session.user.id, today, { steps: Math.round(n) });
          await day.reload();
          await celebrateXp();
          xpFeed.reload();
        }}
      />
      <NumberSheet
        visible={sheet === 'sleep'}
        title="Sleep last night"
        suffix="hours"
        decimal
        initial={sleep ? String(Math.round((sleep / 60) * 10) / 10) : ''}
        onClose={() => setSheet(null)}
        onSave={async (n) => {
          if (n > 24) throw new Error('Enter hours between 0 and 24.');
          await saveHealth(session.user.id, today, { sleep_min: Math.round(n * 60) });
          await day.reload();
          await celebrateXp();
          xpFeed.reload();
        }}
      />
    </Screen>
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

function Habit({
  icon,
  color,
  title,
  value,
  target,
  progress,
  onPress,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  value: string;
  target: string;
  progress: number;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const done = progress >= 1;
  const c = useColors();
  return (
    <Card onPress={onPress} style={styles.habit}>
      <View style={styles.row}>
        <View style={[styles.habitIcon, { backgroundColor: color }]}>
          <Ionicons name={icon} size={16} color="#FFFFFF" />
        </View>
        <AppText variant="smallBold" color="textMuted" style={{ flex: 1 }}>
          {title}
        </AppText>
        {done ? <Ionicons name="checkmark-circle" size={20} color={c.success} /> : null}
      </View>
      <View>
        <AppText variant="stat" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </AppText>
        <AppText variant="small" color="textMuted">
          {target}
        </AppText>
      </View>
      <ProgressBar value={progress} color={color} height={8} />
      {children}
    </Card>
  );
}

function MiniButton({
  label,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon ? label : `Add ${label} ml water`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mini,
        { borderColor: c.hairline, backgroundColor: pressed ? c.primarySoft : c.surface, opacity: disabled ? 0.4 : 1 },
      ]}>
      {icon ? (
        <Ionicons name={icon} size={14} color={c.textMuted} />
      ) : (
        <AppText variant="smallBold" style={{ fontSize: 12 }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
  habit: { flexBasis: '47%', flexGrow: 1, gap: Space.md },
  habitIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mini: { flex: 1, height: 32, borderRadius: Radius.row - 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
