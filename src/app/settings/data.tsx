import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import type { OutboxOp } from '@/lib/outbox-core';
import { discardEntry, retryEntry, useOutboxVersion, waitingEntries } from '@/lib/outbox';
import { supabase } from '@/lib/supabase';

// Everything the user owns. Row-level security limits each to their own rows.
const TABLES = [
  'profiles',
  'workouts',
  'workout_exercises',
  'workout_sets',
  'routines',
  'routine_exercises',
  'exercises',
  'personal_records',
  'food_logs',
  'water_logs',
  'daily_health',
  'body_metrics',
] as const;

/** Every row of a table the user can see, 1,000 at a time (the server's page size). */
async function allRows(table: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from(table)
      .select('*')
      .range(from, from + 999);
    // The exercise library is shared; only the user's own custom exercises are theirs.
    if (table === 'exercises') q = q.not('created_by', 'is', null);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function describeEntry(op: OutboxOp) {
  if (op.kind === 'rpc') return op.name === 'finish_workout' ? 'A workout' : 'A workout edit';
  const what: Record<string, string> = {
    food_logs: 'A food entry',
    water_logs: 'A water entry',
    daily_health: 'Steps or sleep',
    body_metrics: 'A measurement',
    routines: 'A routine',
    routine_exercises: 'A routine',
    foods: 'A custom food',
    exercises: 'A custom exercise',
    workouts: 'A workout change',
  };
  return what[op.table] ?? 'An entry';
}

/** Settings > Import or export data. */
export default function DataSettings() {
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useOutboxVersion();
  const refused = waitingEntries().filter((e) => e.failed);

  async function exportAll() {
    setExporting(true);
    setNote(null);
    try {
      const out: Record<string, unknown> = { exported_at: new Date().toISOString(), units: { weight: 'kg', length: 'cm' } };
      for (const t of TABLES) out[t] = await allRows(t);
      const file = new File(Paths.cache, `shredder-export-${toDay()}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(out, null, 2));
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export Shredder data' });
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not export.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen padTop={false}>
      {refused.length ? <SectionHeader title="Needs attention" /> : null}
      {refused.map((e) => (
        <Card key={e.id} tone="flat" style={{ gap: Space.md }}>
          <AppText variant="bodyBold">{describeEntry(e.op)}</AppText>
          <AppText variant="small" color="textMuted">
            Logged {new Date(e.createdAt).toLocaleString()}. The server refused it: {e.failed}
          </AppText>
          <Button label="Try again" variant="secondary" icon="refresh" onPress={() => retryEntry(e.id)} />
          <Button label="Discard" variant="ghost" icon="trash-outline" onPress={() => discardEntry(e.id)} />
        </Card>
      ))}

      <SectionHeader title="Import" />
      <Card tone="flat" style={{ gap: Space.md }}>
        <AppText variant="small" color="textMuted">
          Bring your workout history and routines over from Hevy.
        </AppText>
        <Button label="Import from Hevy" variant="secondary" icon="download-outline" onPress={() => router.push('/import')} />
        <Button
          label="Match custom exercises to the library"
          variant="ghost"
          icon="git-merge-outline"
          onPress={() => router.push('/exercise/match')}
        />
      </Card>

      <SectionHeader title="Export" />
      <Card tone="flat" style={{ gap: Space.md }}>
        <AppText variant="small" color="textMuted">
          Everything you have logged, as one JSON file: workouts and sets, routines, custom exercises, PRs, food, water, steps,
          sleep and body measurements. Weights are in kg and lengths in cm.
        </AppText>
        <Button label="Export all data" variant="secondary" icon="share-outline" loading={exporting} onPress={exportAll} />
        {note ? (
          <AppText variant="small" color="textMuted">
            {note}
          </AppText>
        ) : null}
      </Card>
    </Screen>
  );
}
