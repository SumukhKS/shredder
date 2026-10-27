import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseDemo } from '@/components/exercise-demo';
import { Button, IconButton } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/use-query';
import { suggestMerges } from '@/lib/exercise-match';
import { libraryAlias } from '@/lib/hevy';
import { fetchExercises, matchesSearch, MUSCLE_LABELS } from '@/lib/workouts';
import { usePicker } from '@/stores/picker';
import { useSession } from '@/stores/session';
import { useWorkout } from '@/stores/workout';
import type { Exercise } from '@/types/db';

export default function ExercisePicker() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode = 'workout' } = useLocalSearchParams<{ mode?: 'workout' | 'routine' }>();
  const addToWorkout = useWorkout((s) => s.addExercises);
  const setPicked = usePicker((s) => s.set);
  const userId = useSession((s) => s.session?.user.id);
  const { data, reload } = useQuery(fetchExercises);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [selected, setSelected] = useState<Exercise[]>([]);
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const q = query.trim();
    return (data ?? []).filter((e) => (!muscle || e.primary_muscle === muscle) && (!q || matchesSearch(e.name, q)));
  }, [data, query, muscle]);

  // Custom exercises that are really library ones (usually from a Hevy import made before the library had them).
  const mergeable = useMemo(() => {
    const all = data ?? [];
    const customs = all.filter((e) => e.created_by && e.created_by === userId);
    return customs.length
      ? suggestMerges(
          customs,
          all.filter((e) => !e.created_by),
          libraryAlias
        ).length
      : 0;
  }, [data, userId]);

  function toggle(e: Exercise) {
    setSelected((s) => (s.some((x) => x.id === e.id) ? s.filter((x) => x.id !== e.id) : [...s, e]));
  }

  async function confirm() {
    if (mode === 'routine') setPicked(selected);
    else await addToWorkout(selected);
    router.back();
  }

  async function createCustom() {
    if (!userId || !query.trim()) return;
    setCreating(true);
    const { data: row, error } = await supabase
      .from('exercises')
      .insert({ name: query.trim(), primary_muscle: muscle ?? 'other', equipment: 'other', created_by: userId })
      .select('*')
      .single();
    setCreating(false);
    if (!error && row) {
      await reload();
      setSelected((s) => [...s, row as Exercise]);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: Space.lg, paddingBottom: Space.md }}>
        <Field value={query} onChangeText={setQuery} placeholder="Search exercises" autoCorrect={false} />
        {mergeable ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/exercise/match')}
            style={[styles.banner, { backgroundColor: c.primarySoft, borderColor: c.primary }]}>
            <Ionicons name="git-merge-outline" size={20} color={c.primary} />
            <AppText variant="smallBold" style={{ flex: 1 }}>
              {mergeable} of your custom exercises {mergeable === 1 ? 'is' : 'are'} in the library now. Tap to match them.
            </AppText>
            <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <ChipRow>
        <Chip label="All" selected={!muscle} onPress={() => setMuscle(null)} />
        {Object.entries(MUSCLE_LABELS).map(([k, label]) => (
          <Chip key={k} label={label} selected={muscle === k} onPress={() => setMuscle(muscle === k ? null : k)} />
        ))}
      </ChipRow>

      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: Space.lg, gap: Space.sm, paddingBottom: 140 }}
        ListEmptyComponent={
          query.trim() ? (
            <View style={{ gap: Space.md, alignItems: 'center', paddingTop: Space.xl }}>
              <AppText color="textMuted">No exercise called “{query.trim()}”.</AppText>
              <Button label={`Create “${query.trim()}”`} variant="secondary" loading={creating} onPress={createCustom} />
            </View>
          ) : undefined
        }
        renderItem={({ item }) => {
          const on = selected.some((s) => s.id === item.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(item)}
              style={[
                styles.item,
                { backgroundColor: on ? c.primarySoft : c.surface, borderColor: on ? c.primary : c.hairline },
              ]}>
              <ExerciseDemo gifId={item.gif_id} still round style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{item.name}</AppText>
                <AppText variant="small" color="textMuted">
                  {MUSCLE_LABELS[item.primary_muscle] ?? item.primary_muscle}
                  {item.created_by ? ', custom' : item.equipment && item.equipment !== 'other' ? `, ${item.equipment}` : ''}
                </AppText>
              </View>
              {on ? <Ionicons name="checkmark-circle" size={22} color={c.primary} /> : null}
              <IconButton
                icon="information-circle-outline"
                label={`How to do ${item.name}`}
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
              />
            </Pressable>
          );
        }}
      />

      {selected.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Space.lg, backgroundColor: c.bg }]}>
          <Button label={`Add ${selected.length} exercise${selected.length > 1 ? 's' : ''}`} size="lg" onPress={confirm} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.row,
    borderWidth: 2,
  },
  avatar: { width: 44, height: 44 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
    padding: Space.md,
    borderRadius: Radius.row,
    borderWidth: 1.5,
  },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Space.lg, paddingTop: Space.md },
});
