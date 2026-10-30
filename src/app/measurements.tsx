import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LineChart } from '@/components/charts';
import { ColumnSheet } from '@/components/column-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { EmptyState, Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { addDays, fromDay, toDay } from '@/lib/dates';
import { buildMeasurements, MEASUREMENT_FIELDS, parseCsv } from '@/lib/csv-import';
import { fetchBodyMetrics, importBodyMetrics, MEASURES, saveBodyMetrics, type Measure, metricsWithWaiting } from '@/lib/profile';
import { refreshStreaks } from '@/lib/streak';
import { cleanDecimal } from '@/lib/validate';
import { fromCm, fromKg, toCm, toKg, useUnits, type LengthUnit, type WeightUnit } from '@/lib/units';
import { useQuery } from '@/lib/use-query';
import { useSession } from '@/stores/session';
import type { BodyMetric } from '@/types/db';

type Range = '1m' | '3m' | '6m' | '1y' | 'all';
const RANGES: { key: Range; label: string; days?: number }[] = [
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 91 },
  { key: '6m', label: '6M', days: 182 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All' },
];

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
  const q = useQuery(() => fetchBodyMetrics(1000), '', { cache: 'measurements', overlay: metricsWithWaiting });
  const [range, setRange] = useState<Range>('3m');
  const [logging, setLogging] = useState(false);
  const userId = useSession((s) => s.session?.user.id);
  const [csv, setCsv] = useState<string[][] | null>(null);
  const [csvWeight, setCsvWeight] = useState<WeightUnit>(units.weight);
  const [csvLength, setCsvLength] = useState<LengthUnit>(units.length);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const rows = q.data ?? [];

  const csvFactors = () => ({ weightFactor: toKg(1, csvWeight), lengthFactor: toCm(1, csvLength) });

  async function chooseCsv() {
    setNotice(null);
    setCsvError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const table = parseCsv(await new File(picked.assets[0].uri).text());
      if (table.length < 2) return setNotice('That file has no rows to import.');
      setCsv(table);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }
  const from = RANGES.find((r) => r.key === range)?.days;
  const since = from ? addDays(toDay(), -from) : '';
  const latestOf = (key: Measure) => [...rows].reverse().find((r) => r[key] != null);
  const logged = MEASURES.filter((x) => latestOf(x.key));

  return (
    <Screen padTop={false} refreshing={q.refreshing} onRefresh={q.refresh}>
      <Button label="Log measurements" icon="add" onPress={() => setLogging(true)} />
      <Button label="Progress photos" icon="camera-outline" variant="secondary" onPress={() => router.push('/progress')} />
      <Button label="Import from CSV" icon="document-outline" variant="secondary" onPress={chooseCsv} />
      {notice ? (
        <AppText variant="small" color="textMuted">
          {notice}
        </AppText>
      ) : null}

      <SectionHeader title="Trends" />
      <Segmented<Range> options={RANGES} value={range} onChange={setRange} />
      {!q.data && q.error ? (
        <EmptyState
          title="Couldn't load your measurements"
          body={q.error}
          action={<Button label="Try again" variant="secondary" icon="refresh" onPress={q.reload} />}
        />
      ) : null}
      {q.data && logged.length === 0 ? (
        <EmptyState title="Nothing logged yet" body="Log a measurement and its trend shows up here." />
      ) : null}
      {logged.map((m) => {
        const points = rows.filter((r) => r[m.key] != null && r.day >= since);
        const first = points[0]?.[m.key];
        const last = points[points.length - 1]?.[m.key];
        return (
          <Card key={m.key} style={{ gap: Space.md }}>
            <AppText variant="h3">{m.label}</AppText>
            {points.length ? (
              <>
                <View style={styles.row}>
                  <AppText variant="stat">
                    {shown(m.kind, Number(last), units)} {unitOf(m.kind, units)}
                  </AppText>
                  <View style={{ flex: 1 }} />
                  {points.length > 1 ? (
                    <AppText variant="smallBold" color="accent">
                      {Number(last) - Number(first) > 0 ? '+' : ''}
                      {round1(shown(m.kind, Number(last), units) - shown(m.kind, Number(first), units))} since{' '}
                      {fromDay(points[0].day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </AppText>
                  ) : null}
                </View>
                {points.length > 1 ? (
                  <LineChart
                    values={points.map((r) => shown(m.kind, Number(r[m.key]), units))}
                    labels={points.map((r) => fromDay(r.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}
                    color={c.primary}
                    height={200}
                    unit={` ${unitOf(m.kind, units)}`}
                  />
                ) : (
                  <AppText variant="small" color="textMuted">
                    Measure again on another day to see the trend.
                  </AppText>
                )}
              </>
            ) : (
              <AppText variant="small" color="textMuted">
                Nothing logged in this period.
              </AppText>
            )}
          </Card>
        );
      })}

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

      {csv ? (
        <ColumnSheet
          title="Match your columns"
          header={csv[0]}
          fields={MEASUREMENT_FIELDS}
          busy={importing}
          error={csvError}
          options={
            <View style={{ gap: Space.sm }}>
              <Segmented<WeightUnit>
                options={[
                  { key: 'kg', label: 'Weight in kg' },
                  { key: 'lb', label: 'Weight in lb' },
                ]}
                value={csvWeight}
                onChange={setCsvWeight}
              />
              <Segmented<LengthUnit>
                options={[
                  { key: 'cm', label: 'Lengths in cm' },
                  { key: 'in', label: 'Lengths in inches' },
                ]}
                value={csvLength}
                onChange={setCsvLength}
              />
            </View>
          }
          preview={(map) => {
            const out = buildMeasurements(csv.slice(1), map, csvFactors());
            return [
              `${out.rows.length.toLocaleString()} days to import`,
              ...(out.badDates ? [`${out.badDates.toLocaleString()} rows skipped: no readable date`] : []),
              ...(out.badCells ? [`${out.badCells.toLocaleString()} values skipped: not a believable number`] : []),
              ...out.rows.slice(0, 3).map(
                (r) =>
                  `${fromDay(r.day).toLocaleDateString(undefined, { dateStyle: 'medium' })}: ${Object.entries(r.values)
                    .map(([k, v]) => `${MEASURES.find((x) => x.key === k)?.label} ${v}`)
                    .join(', ')}`
              ),
            ];
          }}
          onClose={() => setCsv(null)}
          onConfirm={async (map) => {
            const out = buildMeasurements(csv.slice(1), map, csvFactors());
            if (out.rows.length === 0) return setCsvError('No measurements could be read with those columns.');
            setImporting(true);
            setCsvError(null);
            try {
              await importBodyMetrics(userId!, out.rows);
              await refreshStreaks();
              await q.reload();
              setCsv(null);
              setNotice(`Imported ${out.rows.length.toLocaleString()} days. Values already saved on other days were left alone.`);
            } catch (e) {
              setCsvError(e instanceof Error ? e.message : 'The import failed. Check your connection and try again.');
            } finally {
              setImporting(false);
            }
          }}
        />
      ) : null}

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
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + Space.md }}>
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
              onChangeText={(v) => setValues((s) => ({ ...s, [m.key]: cleanDecimal(v) }))}
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
