import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius, Space } from '@/constants/theme';
import { fromDay } from '@/lib/dates';
import type { ProfileTotals } from '@/lib/profile';
import type { Profile } from '@/types/db';

import { BarChart } from './charts';
import { Segmented } from './ui/chips';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

/** Round profile picture, or the first letter of the name when there isn't one. */
export function Avatar({ profile, size = 72 }: { profile: Pick<Profile, 'avatar_url' | 'display_name'>; size?: number }) {
  const c = useColors();
  const letter = (profile.display_name?.trim()[0] ?? '?').toUpperCase();
  return profile.avatar_url ? (
    <Image
      source={{ uri: profile.avatar_url }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surfaceHi }}
      contentFit="cover"
      transition={150}
      accessibilityLabel="Profile picture"
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.surfaceHi,
        borderWidth: 2,
        borderColor: c.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText style={{ fontSize: size * 0.42, lineHeight: size * 0.5 }} variant="h1" color="primary">
        {letter}
      </AppText>
    </View>
  );
}

type Series = 'workouts' | 'dietDays' | 'stepGoalDays';
const SERIES: { key: Series; label: string }[] = [
  { key: 'workouts', label: 'Workouts' },
  { key: 'dietDays', label: 'Diet' },
  { key: 'stepGoalDays', label: 'Steps' },
];
const CAPTION: Record<Series, string> = {
  workouts: 'Workouts',
  dietDays: 'Days with food logged',
  stepGoalDays: 'Days the step goal was hit',
};

/**
 * Picture, name, bio, lifetime totals and a weekly bar graph of them. It's also the image
 * that Share sends, so it paints its own background.
 */
export function ProfileCard({ profile, totals }: { profile: Profile; totals: ProfileTotals | undefined }) {
  const c = useColors();
  const [series, setSeries] = useState<Series>('workouts');
  const weekly = totals?.weekly ?? [];
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <View style={styles.top}>
        <Avatar profile={profile} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="h2" numberOfLines={1}>
            {profile.display_name || 'Athlete'}
          </AppText>
          {profile.bio ? (
            <AppText variant="small" color="textMuted" numberOfLines={3}>
              {profile.bio}
            </AppText>
          ) : null}
        </View>
      </View>

      <View style={styles.totals}>
        <Total value={totals?.workouts} label="Workouts" />
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Total value={totals?.dietDays} label="Diet days" />
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Total value={totals?.stepGoalDays} label="Step goals" />
      </View>

      <Segmented<Series> options={SERIES} value={series} onChange={setSeries} />
      <BarChart
        values={weekly.map((w) => w[series])}
        labels={weekly.map((w, i) => {
          const d = fromDay(w.week);
          const newMonth = i === 0 || fromDay(weekly[i - 1].week).getMonth() !== d.getMonth();
          return i % 2 === 0 || newMonth
            ? newMonth
              ? d.toLocaleDateString(undefined, { month: 'short' })
              : String(d.getDate())
            : '';
        })}
        color={c.primary}
        height={120}
      />
      <AppText variant="small" color="textMuted" align="center">
        {CAPTION[series]} each week, last 12 weeks
      </AppText>
    </View>
  );
}

function Total({ value, label }: { value: number | undefined; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <AppText variant="stat">{value == null ? '-' : value.toLocaleString()}</AppText>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card, borderWidth: 1, padding: Space.lg, gap: Space.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  totals: { flexDirection: 'row', alignItems: 'center' },
  divider: { width: 1, height: 32 },
});
