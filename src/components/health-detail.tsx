import { StyleSheet, View } from 'react-native';

import { Radius, Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import { sleepNight, stepsByHour, type SleepStage } from '@/lib/health';
import { useQuery } from '@/lib/use-query';

import { BarChart } from './charts';
import { Card } from './ui/card';
import { AppText } from './ui/text';
import { useColors } from './ui/theme';

const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
const clockTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);

/** Steps through the day, an hour per bar. */
export function StepsByHour({ day }: { day: string }) {
  const c = useColors();
  const q = useQuery(() => stepsByHour(day), day);
  const hours = q.data;

  if (q.loading && !hours) return null;
  if (!hours) {
    return (
      <Card tone="flat">
        <AppText variant="small" color="textMuted">
          Connect Health Connect below to see when you walked through the day.
        </AppText>
      </Card>
    );
  }
  const upTo = day === toDay() ? new Date().getHours() + 1 : 24;
  const peak = hours.reduce((best, v, h) => (v > hours[best] ? h : best), 0);
  const active = hours.filter((v) => v >= 250).length;

  return (
    <Card style={{ gap: Space.md }}>
      <View style={styles.row}>
        <AppText variant="h3" style={{ flex: 1 }}>
          Through the day
        </AppText>
        <AppText variant="smallBold" color="textMuted">
          {active} active hour{active === 1 ? '' : 's'}
        </AppText>
      </View>
      <BarChart
        values={hours.slice(0, Math.max(upTo, 1))}
        labels={hours.slice(0, Math.max(upTo, 1)).map((_, h) => (h % 6 === 0 ? hourLabel(h) : ''))}
        color={c.primary}
        colorAll
        height={160}
      />
      <AppText variant="small" color="textMuted">
        {hours[peak] > 0
          ? `Busiest hour: ${hourLabel(peak)} to ${hourLabel((peak + 1) % 24)}, ${hours[peak].toLocaleString()} steps`
          : 'No steps recorded yet.'}
      </AppText>
    </Card>
  );
}

const STAGES: { key: SleepStage; label: string }[] = [
  { key: 'awake', label: 'Awake' },
  { key: 'rem', label: 'REM' },
  { key: 'light', label: 'Light' },
  { key: 'deep', label: 'Deep' },
];

/** Sleep stages for the night ending on `day`: a hypnogram plus time in each stage. */
export function SleepStages({ day }: { day: string }) {
  const c = useColors();
  const q = useQuery(() => sleepNight(day), day);
  const night = q.data;
  const color: Record<SleepStage, string> = { awake: c.awake, rem: c.rem, light: c.light, deep: c.deep, asleep: c.primary };

  if (q.loading && !night) return null;
  if (!night) {
    return (
      <Card tone="flat">
        <AppText variant="small" color="textMuted">
          No sleep from a device for this night. Deep, light and REM sleep appear here when your watch or app shares sleep with
          Health Connect.
        </AppText>
      </Card>
    );
  }

  const span = night.end - night.start || 1;
  const staged = night.stages.length > 0;
  const asleep = night.minutes.light + night.minutes.deep + night.minutes.rem + night.minutes.asleep;

  return (
    <Card style={{ gap: Space.md }}>
      <View style={styles.row}>
        <AppText variant="h3" style={{ flex: 1 }}>
          Sleep stages
        </AppText>
        <AppText variant="smallBold" color="textMuted">
          {clockTime(night.start)} to {clockTime(night.end)}
        </AppText>
      </View>

      {staged ? (
        <>
          {/* Hypnogram: one lane per stage, awake on top and deep at the bottom. */}
          <View style={{ gap: 4 }}>
            {STAGES.map((s) => (
              <View key={s.key} style={styles.lane}>
                <AppText variant="small" color="textMuted" style={styles.laneLabel}>
                  {s.label}
                </AppText>
                <View style={[styles.track, { backgroundColor: c.hairline }]}>
                  {night.stages
                    .filter((st) => st.stage === s.key)
                    .map((st, i) => (
                      <View
                        key={i}
                        style={[
                          styles.segment,
                          {
                            left: `${((st.start - night.start) / span) * 100}%`,
                            width: `${Math.max(0.6, ((st.end - st.start) / span) * 100)}%`,
                            backgroundColor: color[s.key],
                          },
                        ]}
                      />
                    ))}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.legend}>
            {STAGES.map((s) => (
              <View key={s.key} style={[styles.stat, { backgroundColor: c.bg, borderColor: c.hairline }]}>
                <View style={[styles.swatch, { backgroundColor: color[s.key] }]} />
                <AppText variant="smallBold" color="textMuted">
                  {s.label}
                </AppText>
                <AppText variant="h3">{hm(night.minutes[s.key])}</AppText>
                <AppText variant="small" color="textMuted">
                  {asleep ? `${Math.round((night.minutes[s.key] / (asleep + night.minutes.awake)) * 100)}%` : '–'}
                </AppText>
              </View>
            ))}
          </View>
        </>
      ) : (
        <AppText variant="small" color="textMuted">
          {hm(night.minutes.asleep)} asleep. Your device recorded this night without stages; watches like Fitbit, Galaxy Watch and
          Pixel Watch add deep, light and REM sleep.
        </AppText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  lane: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  laneLabel: { width: 44 },
  track: { flex: 1, height: 18, borderRadius: 4, overflow: 'hidden' },
  segment: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  stat: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: Radius.row, padding: Space.md, gap: 2 },
  swatch: { width: 18, height: 6, borderRadius: 3 },
});
