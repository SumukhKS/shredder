import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { fetchFromHevyApi, importHevy, parseHevyCsv, type ImportResult } from '@/lib/hevy';
import { useSession } from '@/stores/session';

const HEVY_DEVELOPER = 'https://hevy.com/settings?developer';

export default function ImportScreen() {
  const userId = useSession((s) => s.session?.user.id);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'api' | 'file' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function run(kind: 'api' | 'file', load: () => Promise<Parameters<typeof importHevy>[1] | null>) {
    if (!userId) return;
    setBusy(kind);
    setError(null);
    setResult(null);
    try {
      const source = await load();
      if (!source) return;
      setResult(await importHevy(userId, source, setStatus));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import failed. Try again.');
    } finally {
      setBusy(null);
      setStatus(null);
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
        Bring your training history over from Hevy. Imported workouts fill in your history, charts, personal records and
        the &quot;previous&quot; column. They don&apos;t earn XP, so your level reflects your time in Shredder. Importing
        again later only adds what&apos;s new.
      </AppText>

      <SectionHeader title="Connect your Hevy account" />
      <Card style={{ gap: Space.md }}>
        <AppText variant="small" color="textMuted">
          For Hevy Pro members. Brings in your workouts and your routines. On hevy.com, open Settings → Developer, copy
          your API key and paste it here.
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
          Works with any Hevy account. In the Hevy app, go to Profile → Settings → Export & Import Data → Export Data, export
          your workouts and save the file on this phone. Then choose it here. Routines aren&apos;t included in Hevy&apos;s
          export.
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
    </Screen>
  );
}

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
