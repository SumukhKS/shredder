import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { ExerciseDemo } from '@/components/exercise-demo';
import { PrBadge } from '@/components/pr-badge';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space } from '@/constants/theme';
import { dayLabel, fromDay } from '@/lib/dates';
import {
  allTimeBests,
  chartSeries,
  formatMetric,
  METRIC_LABELS,
  metricInUnit,
  metricUnit,
  metricsFor,
  sessionValue,
  type ExerciseSession,
  type Metric,
} from '@/lib/history-stats';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { useUnits } from '@/lib/units';
import { describeSet, fetchExerciseHistory, MUSCLE_LABELS } from '@/lib/workouts';
import type { Exercise } from '@/types/db';

/** One exercise: your progress and records on a chart, every session you've logged, and how to do it. */
export default function ExerciseDetail() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useQuery(
    async () => {
      const [ex, history] = await Promise.all([
        supabase.from('exercises').select('*').eq('id', id).single(),
        fetchExerciseHistory(id),
      ]);
      if (ex.error) throw ex.error;
      return { ex: ex.data as Exercise, history };
    },
    id,
    { cache: 'exercise' }
  );
  const [picked, setPicked] = useState<Metric | null>(null);
  const units = useUnits();

  if (error) {
    return (
      <Screen padTop={false}>
        <AppText color="danger">{error}</AppText>
      </Screen>
    );
  }
  if (!data) return null;
  const { ex, history } = data;

  const muscles = [ex.primary_muscle, ...ex.secondary_muscles].map((m) => MUSCLE_LABELS[m] ?? m).join(', ');
  const steps = ex.instructions ?? [];
  const metrics = metricsFor(ex.kind);
  const metric = picked && metrics.includes(picked) ? picked : metrics[0];
  const series = chartSeries(metric, history);
  const bests = allTimeBests(ex.kind, history);
  const prSets = history.reduce((n, s) => n + s.sets.filter((x) => x.is_pr).length, 0);

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: ex.name }} />
      <View style={styles.head}>
        {ex.gif_id ? <ExerciseDemo gifId={ex.gif_id} still round style={styles.thumb} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="h2">{ex.name}</AppText>
          <AppText color="textMuted">
            {muscles}
            {ex.equipment && ex.equipment !== 'other' ? `, ${ex.equipment}` : ''}
          </AppText>
        </View>
      </View>

      {history.length ? (
        <>
          <View style={styles.bests}>
            {bests.map((b) => (
              <Card key={b.metric} style={styles.best}>
                <AppText variant="small" color="textMuted">
                  Best {METRIC_LABELS[b.metric].toLowerCase()}
                </AppText>
                <AppText variant="bodyBold">{formatMetric(b.metric, b.value, units.weight)}</AppText>
              </Card>
            ))}
            <Card style={styles.best}>
              <AppText variant="small" color="textMuted">
                PRs
              </AppText>
              <View style={styles.inline}>
                <PrBadge size={18} />
                <AppText variant="bodyBold">{prSets}</AppText>
              </View>
            </Card>
          </View>

          <Card style={{ gap: Space.md }}>
            <AppText variant="h3">Progress</AppText>
            {metrics.length > 1 ? (
              <Segmented
                options={metrics.map((m) => ({ key: m, label: METRIC_LABELS[m] }))}
                value={metric}
                onChange={setPicked}
              />
            ) : null}
            {series.length ? (
              <>
                <LineChart
                  values={series.map((p) => Math.round(metricInUnit(metric, p.value, units.weight) * 10) / 10)}
                  labels={series.map((p) => shortDay(p.day))}
                  marks={series.map((p) => p.pr)}
                  color={c.primary}
                  unit={metricUnit(metric, units.weight)}
                />
                <AppText variant="small" color="textMuted">
                  {series.length} session{series.length === 1 ? '' : 's'}. Filled dots mark sessions where you set a PR; touch the
                  chart to read any session.
                </AppText>
              </>
            ) : (
              <AppText variant="small" color="textMuted">
                No working sets with this measure yet.
              </AppText>
            )}
          </Card>

          <Records
            kind={ex.kind}
            history={history}
            onOpen={(workoutId) => router.push({ pathname: '/workout/[id]', params: { id: workoutId } })}
          />

          <SectionHeader title="History" />
          {history.map((s) => (
            <Session
              key={`${s.workoutId}-${s.startedAt}`}
              session={s}
              kind={ex.kind}
              onOpen={() => router.push({ pathname: '/workout/[id]', params: { id: s.workoutId } })}
            />
          ))}
        </>
      ) : (
        <Card tone="flat">
          <AppText color="textMuted">You haven&apos;t logged this exercise yet. Your progress and PRs will show here.</AppText>
        </Card>
      )}

      <SectionHeader title="How to do it" />
      {ex.gif_id ? <ExerciseDemo gifId={ex.gif_id} style={styles.demo} /> : null}
      {steps.length ? (
        <Card style={{ gap: Space.md }}>
          {steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.num, { backgroundColor: c.primarySoft }]}>
                <AppText variant="smallBold" color="primary">
                  {i + 1}
                </AppText>
              </View>
              <AppText variant="body" style={{ flex: 1 }}>
                {s}
              </AppText>
            </View>
          ))}
        </Card>
      ) : (
        <Card tone="flat">
          <AppText color="textMuted">
            {ex.created_by
              ? 'This is one of your custom exercises, so there is no demo for it.'
              : 'No demo for this exercise yet.'}
          </AppText>
        </Card>
      )}
      {ex.gif_id || ex.media_id ? (
        <AppText variant="small" color="textMuted">
          {ex.gif_id ? 'Animation and instructions: ExerciseDB.' : 'Instructions: Free Exercise DB (public domain).'}
        </AppText>
      ) : null}
    </Screen>
  );
}

/** Every set that was a personal record when it was done, newest first, with its estimated 1RM. */
function Records({
  kind,
  history,
  onOpen,
}: {
  kind: Exercise['kind'];
  history: ExerciseSession[];
  onOpen: (workoutId: string) => void;
}) {
  const c = useColors();
  const units = useUnits();
  const [all, setAll] = useState(false);
  const records = history.flatMap((s) => s.sets.filter((x) => x.is_pr).map((set) => ({ set, session: s })));
  const shown = all ? records : records.slice(0, 5);
  return (
    <Card style={{ gap: Space.sm }}>
      <View style={styles.inline}>
        <PrBadge size={22} />
        <AppText variant="h3" style={{ flex: 1 }}>
          Personal records
        </AppText>
        <AppText variant="smallBold" color="textMuted">
          {records.length}
        </AppText>
      </View>
      {records.length ? (
        shown.map(({ set, session }, i) => {
          const rm = kind === 'weight_reps' ? sessionValue('e1rm', [set]) : null;
          return (
            <Pressable
              key={`${session.workoutId}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`Open ${session.workoutName}`}
              onPress={() => onOpen(session.workoutId)}
              style={({ pressed }) => [
                styles.record,
                { borderColor: c.hairline },
                i === 0 && { backgroundColor: c.surfaceHi },
                pressed && { opacity: 0.6 },
              ]}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{describeSet(kind, set, units.weight)}</AppText>
                <AppText variant="small" color="textMuted">
                  {dayLabel(session.day)}
                  {i === 0 ? ', latest' : ''}
                </AppText>
              </View>
              {rm ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="bodyBold" color="primary">
                    {formatMetric('e1rm', rm, units.weight)}
                  </AppText>
                  <AppText variant="small" color="textMuted">
                    est. 1RM
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          );
        })
      ) : (
        <AppText variant="small" color="textMuted">
          No PRs yet. Your first session is the baseline; beat it on weight or reps to set one.
        </AppText>
      )}
      {records.length > 5 ? (
        <Pressable accessibilityRole="button" onPress={() => setAll(!all)} hitSlop={8}>
          <AppText variant="smallBold" color="primary" align="center">
            {all ? 'Show fewer' : `Show all ${records.length}`}
          </AppText>
        </Pressable>
      ) : null}
    </Card>
  );
}

const shortDay = (day: string) => fromDay(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function Session({ session, kind, onOpen }: { session: ExerciseSession; kind: Exercise['kind']; onOpen: () => void }) {
  const units = useUnits();
  const c = useColors();
  const labels = setLabels(session.sets);
  return (
    <Card tone="flat" style={{ gap: Space.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${session.workoutName}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.inline, pressed && { opacity: 0.6 }]}>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyBold" color="primary" numberOfLines={1}>
            {session.workoutName}
          </AppText>
          <AppText variant="small" color="textMuted">
            {dayLabel(session.day)}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
      </Pressable>
      {session.sets.map((s, i) => (
        <View key={i} style={styles.inline}>
          <AppText variant="bodyBold" color="textMuted" style={{ width: 24 }}>
            {labels[i]}
          </AppText>
          <AppText variant="body">{describeSet(kind, s, units.weight)}</AppText>
          {s.is_pr ? <PrBadge size={20} /> : null}
        </View>
      ))}
    </Card>
  );
}

/** "W" for warm-ups, otherwise the working set's number. */
function setLabels(sets: { set_type: string }[]): string[] {
  const out: string[] = [];
  let n = 0;
  for (const s of sets) {
    if (s.set_type === 'warmup') out.push('W');
    else out.push(String((n += 1)));
  }
  return out;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  thumb: { width: 64, height: 64 },
  bests: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  best: { flexGrow: 1, flexBasis: '30%', padding: Space.md, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.row,
    borderWidth: 1,
  },
  demo: { width: '100%', maxWidth: 420, alignSelf: 'center', aspectRatio: 1 },
  step: { flexDirection: 'row', gap: Space.md, alignItems: 'flex-start' },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
