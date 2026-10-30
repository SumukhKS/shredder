import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LineChart } from '@/components/charts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { fromDay, toDay } from '@/lib/dates';
import { fetchBodyMetrics, MEASURES, saveBodyMetrics, type Measure, metricsWithWaiting } from '@/lib/profile';
import { refreshStreaks } from '@/lib/streak';
import { fromCm, fromKg, toCm, toKg, useUnits, type LengthUnit, type WeightUnit } from '@/lib/units';
import { useQuery } from '@/lib/use-query';
import { useSession } from '@/stores/session';
import type { BodyMetric } from '@/types/db';

type Kind = (typeof MEASURES)[number]['kind'];
const round1 = (n: number) => Math.round(n * 10) / 10;

function shown(kind: Kind, stored: number, u: { weight: WeightUnit; length: LengthUnit }) {
  return round1(kind === 'weight' ? fromKg(stored, u.weight) : kind === 'length' ? fromCm(stored, u.length) : stored);
}
function stored(kind: Kind, typed: number, u: { weight: WeightUnit; length: LengthUnit }) {
  return round1(kind === 'weight' ? toKg(typed, u.weight) : kind === 'length' ? toCm(typed, u.length) : typed);
}
const unitOf = (kind: Kind, u: { weight: WeightUnit; length: LengthUnit }) =>
  kind === 'weight' ? u.weight : kind === 'length' ? u.length : '%';

/** Body weight, body fat and tape measurements: log them and see each one's trend. */
export default function Measurements() {
  const c = useColors();
  const units = useUnits();
  const q = useQuery(() => fetchBodyMetrics(365), '', { overlay: metricsWithWaiting });
  const [selected, setSelected] = useState<Measure>('waist_cm');
  const [logging, setLogging] = useState(false);
  const rows = q.data ?? [];

  const m = MEASURES.find((x) => x.key === selected)!;
  const points = rows.filter((r) => r[selected] != null);
  const latestOf = (key: Measure) => [...rows].reverse().find((r) => r[key] != null);
  const firstVal = points[0]?.[selected];
  const lastVal = points[points.length - 1]?.[selected];

  return (
    <Screen padTop={false} refreshing={q.refreshing} onRefresh={q.refresh}>
      <Button label="Log measurements" icon="add" onPress={() => setLogging(true)} />

      <SectionHeader title="Trend" />
      <ChipRow>
        {MEASURES.map((x) => (
          <Chip key={x.key} label={x.label} selected={selected === x.key} onPress={() => setSelected(x.key)} />
        ))}
      </ChipRow>
      <Card style={{ gap: Space.md }}>
        {points.length ? (
          <>
            <View style={styles.row}>
              <AppText variant="hero">{shown(m.kind, Number(lastVal), units)}</AppText>
              <AppText variant="h3" color="textMuted">
                {unitOf(m.kind, units)}
              </AppText>
              <View style={{ flex: 1 }} />
              {points.length > 1 ? (
                <AppText variant="bodyBold" color="accent">
                  {Number(lastVal) - Number(firstVal) > 0 ? '+' : ''}
                  {round1(shown(m.kind, Number(lastVal), units) - shown(m.kind, Number(firstVal), units))} since{' '}
                  {fromDay(points[0].day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </AppText>
              ) : null}
            </View>
            {points.length > 1 ? (
              <LineChart
                values={points.map((r) => shown(m.kind, Number(r[selected]), units))}
                labels={points.map((r) => fromDay(r.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}
                color={c.primary}
                unit={` ${unitOf(m.kind, units)}`}
              />
            ) : (
              <AppText variant="small" color="textMuted">
                Measure again on another day to see the trend.
              </AppText>
            )}
          </>
        ) : (
          <AppText color="textMuted">No {m.label.toLowerCase()} logged yet.</AppText>
        )}
      </Card>

      <SectionHeader title="Latest" />
      <Card tone="flat" style={{ gap: Space.sm }}>
        {MEASURES.map((x) => {
          const r = latestOf(x.key);
          return (
            <View key={x.key} style={styles.row}>
              <AppText color="textMuted" style={{ flex: 1 }}>
                {x.label}
              </AppText>
              <AppText variant="bodyBold">
                {r ? `${shown(x.kind, Number(r[x.key]), units)} ${unitOf(x.kind, units)}` : '-'}
              </AppText>
              <AppText variant="small" color="textMuted" style={{ width: 56, textAlign: 'right' }}>
                {r ? fromDay(r.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}
              </AppText>
            </View>
          );
        })}
      </Card>

      {logging ? (
        <LogSheet
          today={rows.find((r) => r.day === toDay())}
          onClose={() => setLogging(false)}
          onSaved={async () => {
            setLogging(false);
            await q.reload();
          }}
        />
      ) : null}
    </Screen>
  );
}

/** Every measurement for today, filled in with anything already logged today. Empty fields are left alone. */
function LogSheet({ today, onClose, onSaved }: { today?: BodyMetric; onClose: () => void; onSaved: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const units = useUnits();
  const userId = useSession((s) => s.session?.user.id);
  const [values, setValues] = useState<Partial<Record<Measure, string>>>(() =>
    Object.fromEntries(
      MEASURES.filter((m) => today?.[m.key] != null).map((m) => [m.key, String(shown(m.kind, Number(today![m.key]), units))])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!userId) return;
    const out: Partial<Record<Measure, number>> = {};
    for (const m of MEASURES) {
      const raw = values[m.key]?.replace(',', '.').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!(n > 0)) return setError(`${m.label} needs a number.`);
      const v = stored(m.kind, n, units);
      const [lo, hi] = m.kind === 'weight' ? [30, 300] : m.kind === 'percent' ? [2, 70] : [10, 250];
      if (v < lo || v > hi) return setError(`${m.label} looks off. Check the number and unit.`);
      out[m.key] = v;
    }
    if (!Object.keys(out).length) return setError('Fill in at least one measurement.');
    setSaving(true);
    setError(null);
    try {
      saveBodyMetrics(userId, toDay(), out);
      if (out.weight_kg) await refreshStreaks();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: Space.lg }}>
        <View style={[styles.sheetHead, { paddingHorizontal: Space.lg }]}>
          <AppText variant="h2">Today&apos;s measurements</AppText>
          <Button label="Cancel" size="sm" variant="ghost" onPress={onClose} />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: Space.lg, gap: Space.md, paddingBottom: insets.bottom + Space.xl }}>
          <AppText variant="small" color="textMuted">
            Measure in the morning, relaxed, with the tape snug but not tight. Leave anything you didn&apos;t measure empty.
          </AppText>
          {MEASURES.map((m) => (
            <Field
              key={m.key}
              label={m.label}
              value={values[m.key] ?? ''}
              onChangeText={(v) => setValues((s) => ({ ...s, [m.key]: v }))}
              keyboardType="decimal-pad"
              suffix={unitOf(m.kind, units)}
            />
          ))}
          {error ? (
            <AppText variant="smallBold" color="danger">
              {error}
            </AppText>
          ) : null}
          <Button label="Save" size="lg" loading={saving} onPress={save} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
