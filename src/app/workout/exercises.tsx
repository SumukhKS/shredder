import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseInfoButton, ExerciseList } from '@/components/exercise-list';
import { Button } from '@/components/ui/button';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { usePicker } from '@/stores/picker';
import { useWorkout } from '@/stores/workout';
import type { Exercise } from '@/types/db';

export default function ExercisePicker() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode = 'workout' } = useLocalSearchParams<{ mode?: 'workout' | 'routine' }>();
  const addToWorkout = useWorkout((s) => s.addExercises);
  const setPicked = usePicker((s) => s.set);
  const [selected, setSelected] = useState<Exercise[]>([]);

  // An exercise just made in the form starts out picked.
  useFocusEffect(
    useCallback(() => {
      const { created, setCreated } = usePicker.getState();
      if (created) {
        setCreated(null);
        setSelected((s) => [...s, created]);
      }
    }, [])
  );

  function toggle(e: Exercise) {
    setSelected((s) => (s.some((x) => x.id === e.id) ? s.filter((x) => x.id !== e.id) : [...s, e]));
  }

  function confirm() {
    if (mode === 'routine') setPicked(selected);
    else addToWorkout(selected);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: Space.lg }}>
      <ExerciseList
        onPress={toggle}
        isOn={(e) => selected.some((s) => s.id === e.id)}
        trailing={(e) => (
          <>
            {selected.some((s) => s.id === e.id) ? <Ionicons name="checkmark-circle" size={22} color={c.primary} /> : null}
            <ExerciseInfoButton exercise={e} />
          </>
        )}
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
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Space.lg, paddingTop: Space.md },
});
