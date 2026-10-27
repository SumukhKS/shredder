import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { glow, Gradients, Radius, Space } from '@/constants/theme';
import { dayStreak } from '@/lib/streak';
import type { Profile } from '@/types/db';

import { Card } from './ui/card';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

/** Daily and weekly streaks side by side: the one loud surface on the home screen. */
export function StreakCard({
  profile,
  weeks,
  onPress,
}: {
  profile: Profile;
  weeks?: { current: number; thisWeekDone: boolean };
  onPress?: () => void;
}) {
  const c = useColors();
  const days = dayStreak(profile);
  const weekCount = weeks?.current ?? 0;

  return (
    <Card tone="hero" onPress={onPress} style={styles.row}>
      <Streak
        icon="flame"
        value={days}
        unit={days === 1 ? 'day' : 'days'}
        detail={days > 0 ? 'Log anything today to keep it' : 'Log anything to start one'}
        lit={days > 0}
      />
      <View style={[styles.divider, { backgroundColor: c.border }]} />
      <Streak
        icon="calendar"
        value={weekCount}
        unit={weekCount === 1 ? 'week' : 'weeks'}
        detail={weeks?.thisWeekDone ? 'Trained this week' : 'Train this week to keep it'}
        lit={!!weeks?.thisWeekDone}
      />
    </Card>
  );
}

function Streak({
  icon,
  value,
  unit,
  detail,
  lit,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  unit: string;
  detail: string;
  lit: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ flex: 1, gap: Space.sm }}>
      {lit ? (
        <LinearGradient
          colors={Gradients.blaze}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.badge, glow(c.glow, 18)]}>
          <Ionicons name={icon} size={18} color={c.onPrimary} />
        </LinearGradient>
      ) : (
        <View style={[styles.badge, { backgroundColor: c.primarySoft }]}>
          <Ionicons name={icon} size={18} color={c.textMuted} />
        </View>
      )}
      <View style={styles.value}>
        <AppText variant="hero" style={{ fontSize: 40, lineHeight: 42 }}>
          {value}
        </AppText>
        <AppText variant="h3" color="textMuted">
          {unit}
        </AppText>
      </View>
      <AppText variant="small" color="textMuted">
        {detail}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.lg },
  divider: { width: 2, borderRadius: 1 },
  badge: { width: 36, height: 36, borderRadius: Radius.row, alignItems: 'center', justifyContent: 'center' },
  value: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
});
