import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseDemo } from '@/components/exercise-demo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { LoadError, EmptyState, Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space } from '@/constants/theme';
import { fetchAliases, fetchRecentMerges, mergeExercises, undoMerge } from '@/lib/auto-merge';
import { nameScore, suggestMerges } from '@/lib/exercise-match';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { fetchExercises, matchesSearch, MUSCLE_LABELS } from '@/lib/workouts';
import { useSession } from '@/stores/session';
import { useWorkout } from '@/stores/workout';
import type { Exercise } from '@/types/db';

/**
 * Your custom exercises that are already in the library (often made by a Hevy import before the
 * library had them), each with the library exercise it most likely is. Merging moves every logged
 * set, routine and record onto the library exercise and removes the custom copy. Sure matches are
 * merged by themselves once a day (see `autoMergeExercises`); custom exercises with no suggestion
 * can be pointed at any library exercise by hand.
 */
export default function MatchExercises() {
  const c = useColors();
  const router = useRouter();
  const userId = useSession((s) => s.session?.user.id);
  const q = useQuery(async () => {
    const [all, aliases] = await Promise.all([fetchExercises(), fetchAliases()]);
    const customs = all.filter((e) => e.created_by === userId);
    const library = all.filter((e) => e.created_by === null);
    const suggestions = suggestMerges(customs, library, aliases);
    const suggested = new Set(suggestions.map((s) => s.custom.id));
    const unmatched = customs.filter((e) => !suggested.has(e.id));
    const uses = new Map<string, number>();
    if (customs.length) {
      const { data, error } = await supabase
        .from('workout_exercises')
        .select('exercise_id')
        .in(
          'exercise_id',
          customs.map((e) => e.id)
        );
      if (error) throw error;
      for (const r of data ?? []) uses.set(r.exercise_id as string, (uses.get(r.exercise_id as string) ?? 0) + 1);
    }
    return { suggestions, uses, unmatched, library };
  }, userId ?? '');
  // Ticked rows: starts with the sure matches; a tap flips one.
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The custom exercise being matched by hand.
  const [picking, setPicking] = useState<Exercise | null>(null);
  const workoutRunning = useWorkout((s) => !!s.active);
  const merges = useQuery(fetchRecentMerges, '');

  const suggestions = q.data?.suggestions ?? [];
  const unmatched = q.data?.unmatched ?? [];
  const ticked = suggestions.filter((s) => s.sure !== flipped.has(s.custom.id));

  async function undo(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      await undoMerge(id);
      setMessage('Merge undone. The exercise and its history are back as they were.');
      q.reload();
      merges.reload();
    } catch (e) {
      setMessage(`Couldn't undo: ${e instanceof Error ? e.message : 'try again'}`);
    } finally {
      setBusy(false);
    }
  }

  async function merge(pairs: { from: string; to: string }[]) {
    setBusy(true);
    setMessage(null);
    try {
      const n = await mergeExercises(pairs);
      setFlipped(new Set());
      merges.reload();
      setMessage(`Merged ${n} exercise${n === 1 ? '' : 's'}. Their history, PRs and routines now use the library exercise.`);
      q.reload();
    } catch (e) {
      setMessage(`Couldn't merge: ${e instanceof Error ? e.message : 'try again'}`);
    } finally {
      setBusy(false);
    }
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
              disabled={workoutRunning}
              onPress={() => merge(ticked.map((s) => ({ from: s.custom.id, to: s.match.id })))}
            />
          </View>
        ) : null
      }>
      <LoadError q={q} what="your exercises" />
      <Stack.Screen options={{ title: 'Match to library' }} />
      {merges.data?.length ? (
        <Card tone="flat" style={{ gap: Space.sm }}>
          <AppText variant="bodyBold">Recent merges</AppText>
          {merges.data.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
              <AppText variant="small" color="textMuted" style={{ flex: 1 }} numberOfLines={2}>
                {m.name}, {new Date(m.merged_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </AppText>
              <Button label="Undo" size="sm" variant="secondary" disabled={busy || workoutRunning} onPress={() => undo(m.id)} />
            </View>
          ))}
        </Card>
      ) : null}
      <AppText color="textMuted">
        These custom exercises look like ones in the library. Merging moves every set you logged, your PRs and routines onto the
        library exercise, which has its own demo and instructions. Tap a row to include or leave it out.
      </AppText>
      {workoutRunning ? (
        <Card tone="flat" style={{ borderColor: c.primary }}>
          <AppText variant="smallBold">Finish or discard the workout in progress first: it still uses these exercises.</AppText>
        </Card>
      ) : null}
      {message ? (
        <Card tone="flat">
          <AppText variant="bodyBold">{message}</AppText>
        </Card>
      ) : null}

      {q.data && suggestions.length === 0 && unmatched.length === 0 ? (
        <EmptyState
          title="Nothing to match"
          body="All your exercises use the library."
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
      {unmatched.length ? (
        <>
          <SectionHeader title="Match by hand" />
          <AppText variant="small" color="textMuted">
            No library exercise looked close enough for these. If one of them is in the library under another name, tap it and
            pick the library exercise.
          </AppText>
          {unmatched.map((e) => {
            const used = q.data?.uses.get(e.id) ?? 0;
            return (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                accessibilityLabel={`Find ${e.name} in the library`}
                disabled={workoutRunning}
                onPress={() => setPicking(e)}
                style={[styles.row, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold">{e.name}</AppText>
                  <AppText variant="small" color="textMuted">
                    Custom{used ? `, logged ${used} time${used === 1 ? '' : 's'}` : ''}
                  </AppText>
                </View>
                <AppText variant="smallBold" color="primary">
                  Find in library
                </AppText>
                <Ionicons name="search" size={18} color={c.primary} />
              </Pressable>
            );
          })}
        </>
      ) : null}

      <LibraryPicker
        custom={picking}
        library={q.data?.library ?? []}
        onClose={() => setPicking(null)}
        onPick={(target) => {
          const from = picking;
          setPicking(null);
          if (from) merge([{ from: from.id, to: target.id }]);
        }}
      />
    </Screen>
  );
}

/** Search the library for the exercise a custom one really is; the closest names come first. */
function LibraryPicker({
  custom,
  library,
  onClose,
  onPick,
}: {
  custom: Exercise | null;
  library: Exercise[];
  onClose: () => void;
  onPick: (e: Exercise) => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    if (!custom) return [];
    const q = query.trim();
    if (q) return library.filter((e) => matchesSearch(e.name, q)).slice(0, 60);
    // Before typing: the library exercises whose names share the most with this one.
    return library
      .map((e) => ({ e, score: nameScore(custom.name, e.name) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((x) => x.e);
  }, [custom, library, query]);

  return (
    <Modal visible={!!custom} animationType="slide" onRequestClose={onClose} onShow={() => setQuery('')}>
      <View style={[styles.sheet, { backgroundColor: c.bg, paddingTop: insets.top + Space.md }]}>
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <AppText variant="small" color="textMuted">
              Which library exercise is
            </AppText>
            <AppText variant="h3" numberOfLines={2}>
              {custom?.name}?
            </AppText>
          </View>
          <Button label="Cancel" size="sm" variant="ghost" onPress={onClose} />
        </View>
        <Field label="Search the library" value={query} onChangeText={setQuery} autoFocus />
        <FlatList
          data={results}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: Space.sm, paddingBottom: insets.bottom + Space.xl }}
          ListEmptyComponent={
            <AppText color="textMuted" align="center" style={{ marginTop: Space.xl }}>
              {query.trim() ? 'No library exercise has that name.' : 'Type part of the name to search.'}
            </AppText>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Merge into ${item.name}`}
              onPress={() => onPick(item)}
              style={[styles.target, styles.result, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <ExerciseDemo gifId={item.gif_id} still round style={styles.thumb} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{item.name}</AppText>
                <AppText variant="small" color="textMuted">
                  {MUSCLE_LABELS[item.primary_muscle] ?? item.primary_muscle}
                </AppText>
              </View>
              <Ionicons name="git-merge-outline" size={18} color={c.primary} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.row, borderWidth: 2 },
  target: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  thumb: { width: 40, height: 40 },
  footer: { paddingHorizontal: Space.lg, paddingTop: Space.md, paddingBottom: Space.xl },
  sheet: { flex: 1, paddingHorizontal: Space.lg, gap: Space.md },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  result: { padding: Space.md, borderRadius: Radius.row, borderWidth: 1 },
});
