import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { hardShadow, Radius, Space } from '@/constants/theme';
import { levelFromXp, levelTitle } from '@/lib/xp';
import type { Profile } from '@/types/db';

import { Card } from './ui/card';
import { ProgressBar } from './ui/progress';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

/** The one loud surface on the home screen: level, XP progress and streak. */
export function LevelCard({ profile }: { profile: Profile }) {
  const c = useColors();
  const lv = levelFromXp(profile.total_xp);
  const streak = profile.current_streak;

  return (
    <Card tone="hero" bg={c.primary} style={{ gap: Space.lg }}>
      <View style={styles.row}>
        <View style={[styles.levelBadge, { backgroundColor: c.surface, borderColor: c.border }, hardShadow(c.shadow, 3)]}>
          <AppText variant="smallBold" color="textMuted" style={{ fontSize: 11 }}>
            LEVEL
          </AppText>
          <AppText variant="h1" style={{ fontSize: 34, lineHeight: 36 }}>
            {lv.level}
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="h2" color="#FFFFFF">
            {levelTitle(lv.level)}
          </AppText>
          <AppText variant="small" color="#FFFFFF" style={{ opacity: 0.85 }}>
            {profile.total_xp.toLocaleString()} XP total
          </AppText>
        </View>
        <View
          accessibilityLabel={`${streak} day streak`}
          style={[styles.streak, { backgroundColor: streak > 0 ? c.xp : 'rgba(255,255,255,0.18)', borderColor: c.border }]}>
          <Ionicons name="flame" size={18} color="#FFFFFF" />
          <AppText variant="bodyBold" color="#FFFFFF">
            {streak}
          </AppText>
        </View>
      </View>

      <View style={{ gap: Space.sm }}>
        <ProgressBar value={lv.progress} color={c.xp} track="rgba(255,255,255,0.25)" height={16} outlined />
        <View style={styles.row}>
          <AppText variant="smallBold" color="#FFFFFF" style={{ flex: 1 }}>
            {lv.intoLevel} / {lv.levelSize} XP
          </AppText>
          <AppText variant="small" color="#FFFFFF" style={{ opacity: 0.85 }}>
            {lv.toNext} XP to level {lv.level + 1}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  levelBadge: {
    width: 68,
    height: 68,
    borderRadius: Radius.row,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: Radius.chip,
    borderWidth: 2,
  },
});
