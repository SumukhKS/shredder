import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColumnSheet } from '@/components/column-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space } from '@/constants/theme';
import { buildWorkouts, parseCsv, WORKOUT_FIELDS } from '@/lib/csv-import';
import {
  fetchFromHevyApi,
  importHevy,
  parseHevyCsv,
  prepareImport,
  type ImportAnswers,
  type ImportQuestion,
  type ImportResult,
  type ImportSource,
} from '@/lib/hevy';
import { useUnits, type WeightUnit } from '@/lib/units';
import { matchesSearch, MUSCLE_LABELS } from '@/lib/workouts';
import { useSession } from '@/stores/session';
import type { Exercise } from '@/types/db';

const HEVY_DEVELOPER = 'https://hevy.com/settings?developer';

export default function ImportScreen() {
  const userId = useSession((s) => s.session?.user.id);
  const units = useUnits();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'api' | 'file' | 'review' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [csv, setCsv] = useState<string[][] | null>(null);
  const [csvWeight, setCsvWeight] = useState<WeightUnit>(units.weight);
  const [csvDistance, setCsvDistance] = useState<'m' | 'km' | 'mi'>('m');

  // Names to ask about before saving anything, with the file or account they came from.
  const [review, setReview] = useState<{ source: ImportSource; questions: ImportQuestion[]; library: Exercise[] } | null>(null);

  async function save(source: ImportSource, answers?: ImportAnswers) {
    setResult(await importHevy(userId!, source, setStatus, answers));
  }

  async function run(kind: 'api' | 'file', load: () => Promise<ImportSource | null>) {
    if (!userId) return;
    setBusy(kind);
    setError(null);
    setResult(null);
    try {
      const source = await load();
      if (!source) return;
      setStatus('Matching exercises…');
      const { questions, library } = await prepareImport(userId, source);
      if (questions.length) setReview({ source, questions, library });
      else await save(source);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import failed. Try again.');
    } finally {
      setBusy(null);
      setStatus(null);
    }
  }

  const csvUnits = () => ({
    weightFactor: csvWeight === 'kg' ? 1 : 0.45359237,
    metresPerUnit: csvDistance === 'm' ? 1 : csvDistance === 'km' ? 1000 : 1609.344,
  });

  async function chooseCsv() {
    setError(null);
    setResult(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const rows = parseCsv(await new File(picked.assets[0].uri).text());
      if (rows.length < 2) throw new Error('That file has no rows to import.');
      setCsv(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  const fromApi = () => run('api', () => fetchFromHevyApi(apiKey.trim(), setStatus));

  const fromFile = () =>
    run('file', async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return null;
      setStatus('Reading the file…');
      return { workouts: parseHevyCsv(await new File(picked.assets[0].uri).text()) };
    });

  return (
    <Screen padTop={false}>
      <AppText variant="body" color="textMuted">
        Bring your training history over from Hevy. Imported workouts fill in your history, charts, personal records and the
        &quot;previous&quot; column. They don&apos;t earn XP, so your level reflects your time in Shredder. Importing again later
        only adds what&apos;s new.
      </AppText>

      <SectionHeader title="Connect your Hevy account" />
      <Card style={{ gap: Space.md }}>
        <AppText variant="small" color="textMuted">
          For Hevy Pro members. Brings in your workouts and your routines. On hevy.com, open Settings → Developer, copy your API
          key and paste it here.
        </AppText>
        <Button
          label="Open Hevy developer settings"
          variant="secondary"
          size="sm"
          icon="open-outline"
          onPress={() => WebBrowser.openBrowserAsync(HEVY_DEVELOPER)}
        />
        <Field
          label="Hevy API key"
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Paste your key"
        />
        <Button
          label="Import workouts and routines"
          loading={busy === 'api'}
          disabled={!!busy || apiKey.trim().length < 10}
          onPress={fromApi}
        />
      </Card>

      <SectionHeader title="Or import Hevy's export file" />
      <Card style={{ gap: Space.md }}>
        <AppText variant="small" color="textMuted">
          Works with any Hevy account. In the Hevy app, go to Profile → Settings → Export & Import Data → Export Data, export your
          workouts and save the file on this phone. Then choose it here. Routines aren&apos;t included in Hevy&apos;s export.
        </AppText>
        <Button
          label="Choose Hevy export file"
          variant="secondary"
          icon="document-outline"
          loading={busy === 'file'}
          disabled={!!busy}
          onPress={fromFile}
        />
      </Card>

      <SectionHeader title="Or import from another app" />
      <Card style={{ gap: Space.md }}>
        <AppText variant="small" color="textMuted">
          For Strong, Liftoff, FitNotes, Jefit or any app that exports a CSV with one row per set. You choose which column is
          which and see a preview first.
        </AppText>
        <Button label="Choose CSV file" variant="secondary" icon="document-outline" disabled={!!busy} onPress={chooseCsv} />
      </Card>

      {status ? (
        <AppText variant="smallBold" color="textMuted">
          {status}
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="smallBold" color="danger">
          {error}
        </AppText>
      ) : null}
      {result ? <Summary result={result} /> : null}
      {csv ? (
        <ColumnSheet
          title="Match your columns"
          header={csv[0]}
          fields={WORKOUT_FIELDS}
          busy={false}
          error={null}
          options={
            <View style={{ gap: Space.sm }}>
              <Segmented<WeightUnit>
                options={[
                  { key: 'kg', label: 'Weights in kg' },
                  { key: 'lb', label: 'Weights in lb' },
                ]}
                value={csvWeight}
                onChange={setCsvWeight}
              />
              <Segmented<'m' | 'km' | 'mi'>
                options={[
                  { key: 'm', label: 'Metres' },
                  { key: 'km', label: 'Kilometres' },
                  { key: 'mi', label: 'Miles' },
                ]}
                value={csvDistance}
                onChange={setCsvDistance}
              />
            </View>
          }
          preview={(map) => {
            const { workouts, skipped } = buildWorkouts(csv.slice(1), map, csvUnits());
            const sets = workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
            return [
              `${workouts.length.toLocaleString()} workouts, ${sets.toLocaleString()} sets`,
              ...(skipped ? [`${skipped.toLocaleString()} rows skipped: no readable date or exercise`] : []),
              ...workouts
                .slice(0, 3)
                .map(
                  (w) =>
                    `${w.startedAt.toLocaleDateString(undefined, { dateStyle: 'medium' })}: ${w.name}, ${w.exercises.length} exercises`
                ),
            ];
          }}
          onClose={() => setCsv(null)}
          onConfirm={(map) => {
            const { workouts } = buildWorkouts(csv.slice(1), map, csvUnits());
            setCsv(null);
            run('file', async () => {
              if (workouts.length === 0) throw new Error('No workouts could be read with those columns.');
              return { workouts, app: 'csv' };
            });
          }}
        />
      ) : null}
      {review ? (
        <ReviewSheet
          questions={review.questions}
          library={review.library}
          busy={busy === 'review'}
          onClose={() => setReview(null)}
          onConfirm={async (answers) => {
            setBusy('review');
            setError(null);
            try {
              await save(review.source, answers);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'The import failed. Try again.');
            } finally {
              setReview(null);
              setBusy(null);
              setStatus(null);
            }
          }}
        />
      ) : null}
    </Screen>
  );
}

/** Asks what each unrecognised exercise is. Nothing is saved until this is confirmed, and the choices are remembered. */
function ReviewSheet({
  questions,
  library,
  busy,
  onClose,
  onConfirm,
}: {
  questions: ImportQuestion[];
  library: Exercise[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (answers: ImportAnswers) => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [answers, setAnswers] = useState<ImportAnswers>(() => new Map(questions.map((q) => [q.title, q.suggestion?.id ?? null])));
  const [searching, setSearching] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const results = useMemo(() => {
    const t = query.trim();
    return t ? library.filter((e) => matchesSearch(e.name, t)).slice(0, 30) : [];
  }, [library, query]);
  const answer = (title: string, id: string | null) => setAnswers((a) => new Map(a).set(title, id));

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + Space.lg }}>
        <View style={{ paddingHorizontal: Space.lg, gap: Space.xs }}>
          <AppText variant="h2">
            Check {questions.length} exercise{questions.length === 1 ? '' : 's'}
          </AppText>
          <AppText variant="small" color="textMuted">
            Shredder isn&apos;t sure about these names. Choose what each one is, and it will remember for next time.
          </AppText>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: Space.lg, gap: Space.md }}>
          {questions.map((q) => {
            const chosen = answers.get(q.title) ?? null;
            const open = searching === q.title;
            return (
              <Card key={q.title} tone="flat" style={{ gap: Space.sm }}>
                <AppText variant="bodyBold">{q.title}</AppText>
                <AppText variant="small" color="textMuted">
                  {q.sets.length} set{q.sets.length === 1 ? '' : 's'} in this import
                </AppText>
                <AppText variant="small" color={chosen ? 'text' : 'textMuted'}>
                  {chosen ? `Use: ${byId.get(chosen)?.name}` : 'Create as my own exercise'}
                </AppText>
                <View style={styles.row}>
                  {q.suggestion && chosen !== q.suggestion.id ? (
                    <Button
                      label="Use suggestion"
                      size="sm"
                      variant="secondary"
                      onPress={() => answer(q.title, q.suggestion!.id)}
                    />
                  ) : null}
                  <Button
                    label="Search library"
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      setSearching(open ? null : q.title);
                      setQuery('');
                    }}
                  />
                  {chosen ? <Button label="Create new" size="sm" variant="ghost" onPress={() => answer(q.title, null)} /> : null}
                </View>
                {open ? (
                  <View style={{ gap: Space.xs }}>
                    <Field value={query} onChangeText={setQuery} placeholder="Search exercises" autoCorrect={false} autoFocus />
                    {results.map((e) => (
                      <Pressable
                        key={e.id}
                        accessibilityRole="button"
                        onPress={() => {
                          answer(q.title, e.id);
                          setSearching(null);
                        }}
                        style={[styles.result, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                        <AppText variant="bodyBold">{e.name}</AppText>
                        <AppText variant="small" color="textMuted">
                          {MUSCLE_LABELS[e.primary_muscle] ?? e.primary_muscle}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </ScrollView>
        <View style={[styles.row, { padding: Space.lg, paddingBottom: insets.bottom + Space.lg }]}>
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} style={{ flex: 1 }} />
          <Button label="Import" loading={busy} onPress={() => onConfirm(answers)} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  result: { padding: Space.md, borderRadius: Radius.row, borderWidth: 1.5, gap: 2 },
});

function Summary({ result }: { result: ImportResult }) {
  const lines = [
    `${result.imported} workout${result.imported === 1 ? '' : 's'} imported`,
    result.skipped ? `${result.skipped} already in Shredder, skipped` : null,
    result.routines ? `${result.routines} routine${result.routines === 1 ? '' : 's'} added` : null,
  ].filter(Boolean);
  return (
    <Card tone="flat" style={{ gap: Space.sm }}>
      <AppText variant="h3">Import finished</AppText>
      {lines.map((l) => (
        <AppText key={l} variant="body">
          {l}
        </AppText>
      ))}
      {result.newExercises.length ? (
        <View style={{ gap: 2 }}>
          <AppText variant="small" color="textMuted">
            Shredder didn&apos;t have these exercises, so they were added as your own custom exercises:
          </AppText>
          <AppText variant="small">{result.newExercises.join(', ')}</AppText>
        </View>
      ) : null}
    </Card>
  );
}
