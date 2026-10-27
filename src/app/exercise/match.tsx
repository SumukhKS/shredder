import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ExerciseDemo } from '@/components/exercise-demo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space } from '@/constants/theme';
import { suggestMerges } from '@/lib/exercise-match';
import { libraryAlias } from '@/lib/hevy';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { fetchExercises, MUSCLE_LABELS } from '@/lib/workouts';
import { useSession } from '@/stores/session';

/**
 * Your custom exercises that are already in the library (often made by a Hevy import before the
 * library had them), each with the library exercise it most likely is. Merging moves every logged
 * set, routine and record onto the library exercise and removes the custom copy.
 */
export default function MatchExercises() {
  const c = useColors();
  const router = useRouter();
  const userId = useSession((s) => s.session?.user.id);
  const q = useQuery(async () => {
    const all = await fetchExercises();
    const customs = all.filter((e) => e.created_by === userId);
    const library = all.filter((e) => e.created_by === null);
    const suggestions = suggestMerges(customs, library, libraryAlias);
    const uses = new Map<string, number>();
    if (suggestions.length) {
      const { data, error } = await supabase
        .from('workout_exercises')
        .select('exercise_id')
        .in(
          'exercise_id',
          suggestions.map((s) => s.custom.id)
        );
      if (error) throw error;
      for (const r of data ?? []) uses.set(r.exercise_id as string, (uses.get(r.exercise_id as string) ?? 0) + 1);
    }
    return { suggestions, uses, unmatched: customs.length - suggestions.length };
  }, userId ?? '');
  // Ticked rows: starts with the sure matches; a tap flips one.
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const suggestions = q.data?.suggestions ?? [];
  const ticked = suggestions.filter((s) => s.sure !== flipped.has(s.custom.id));

  async function merge() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('merge_exercises', {
      p_pairs: ticked.map((s) => ({ from: s.custom.id, to: s.match.id })),
    });
    setBusy(false);
    if (error) {
      setMessage(`Couldn't merge: ${error.message}`);
      return;
    }
    setFlipped(new Set());
    setMessage(`Merged ${data} exercise${data === 1 ? '' : 's'}. Their history, PRs and routines now use the library exercise.`);
    q.reload();
  }

  return (
    <Screen
      padTop={false}
      footer={
        ticked.length ? (
          <View style={[styles.footer, { backgroundColor: c.bg }]}>
            <Button
              label={`Merge ${ticked.length} exercise${ticked.length === 1 ? '' : 's'}`}
              icon="git-merge-outline"
              size="lg"
              loading={busy}
              onPress={merge}
            />
          </View>
        ) : null
      }>
      <Stack.Screen options={{ title: 'Match to library' }} />
      <AppText color="textMuted">
        These custom exercises look like ones in the library. Merging moves every set you logged, your PRs and routines onto the
        library exercise, which has its own demo and instructions. Tap a row to include or leave it out.
      </AppText>
      {message ? (
        <Card tone="flat">
          <AppText variant="bodyBold">{message}</AppText>
        </Card>
      ) : null}

      {q.data && suggestions.length === 0 ? (
        <EmptyState
          title="Nothing to match"
          body={
            q.data.unmatched
              ? `Your ${q.data.unmatched} custom exercise${q.data.unmatched === 1 ? " isn't" : "s aren't"} in the library, so they stay custom.`
              : "You don't have any custom exercises."
          }
          action={<Button label="Done" variant="secondary" onPress={() => router.back()} />}
        />
      ) : null}

      {suggestions.map((s) => {
        const on = s.sure !== flipped.has(s.custom.id);
        const used = q.data?.uses.get(s.custom.id) ?? 0;
        return (
          <Pressable
            key={s.custom.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`Merge ${s.custom.name} into ${s.match.name}`}
            onPress={() =>
              setFlipped((f) => {
                const next = new Set(f);
                if (next.has(s.custom.id)) next.delete(s.custom.id);
                else next.add(s.custom.id);
                return next;
              })
            }
            style={[styles.row, { backgroundColor: on ? c.primarySoft : c.surface, borderColor: on ? c.primary : c.hairline }]}>
            <View style={{ flex: 1, gap: Space.sm }}>
              <View>
                <AppText variant="small" color="textMuted">
                  Your custom exercise{used ? `, logged ${used} time${used === 1 ? '' : 's'}` : ''}
                </AppText>
                <AppText variant="bodyBold">{s.custom.name}</AppText>
              </View>
              <View style={styles.target}>
                <Ionicons name="arrow-down" size={16} color={c.textMuted} />
                <ExerciseDemo gifId={s.match.gif_id} still round style={styles.thumb} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold" color="primary">
                    {s.match.name}
                  </AppText>
                  <AppText variant="small" color="textMuted">
                    {MUSCLE_LABELS[s.match.primary_muscle] ?? s.match.primary_muscle}
                    {s.sure ? '' : ', close match: check it'}
                  </AppText>
                </View>
              </View>
            </View>
            <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? c.primary : c.textMuted} />
          </Pressable>
        );
      })}
      {q.data && suggestions.length && q.data.unmatched ? (
        <AppText variant="small" color="textMuted">
          {q.data.unmatched} other custom exercise{q.data.unmatched === 1 ? ' has' : 's have'} no match in the library and stay as
          they are.
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.row, borderWidth: 2 },
  target: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  thumb: { width: 40, height: 40 },
  footer: { paddingHorizontal: Space.lg, paddingTop: Space.md, paddingBottom: Space.xl },
});
