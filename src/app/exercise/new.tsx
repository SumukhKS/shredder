import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { enqueue } from '@/lib/outbox';
import { newId } from '@/lib/outbox-core';
import { readCache } from '@/lib/use-query';
import { MUSCLE_LABELS } from '@/lib/workouts';
import { usePicker } from '@/stores/picker';
import { useSession } from '@/stores/session';
import type { Exercise, ExerciseKind } from '@/types/db';

const EQUIPMENT: [string, string][] = [
  ['barbell', 'Barbell'],
  ['dumbbell', 'Dumbbell'],
  ['machine', 'Machine'],
  ['cable', 'Cable'],
  ['bodyweight', 'Bodyweight'],
  ['band', 'Band'],
  ['kettlebell', 'Kettlebell'],
  ['other', 'Other'],
];

const KINDS: [ExerciseKind, string][] = [
  ['weight_reps', 'Weight and reps'],
  ['bodyweight_reps', 'Bodyweight reps'],
  ['duration', 'Duration'],
  ['distance_time', 'Distance and time'],
];

/** Create exercise: private to you, like every custom exercise. */
export default function NewExercise() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; muscle?: string }>();
  const userId = useSession((s) => s.session?.user.id);
  const [name, setName] = useState(params.name ?? '');
  const [muscle, setMuscle] = useState(params.muscle ?? '');
  const [equipment, setEquipment] = useState('other');
  const [kind, setKind] = useState<ExerciseKind>('weight_reps');
  const [error, setError] = useState<string | null>(null);

  function save() {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!userId) return;
    if (!clean) return setError('Give the exercise a name.');
    if (clean.length > 120) return setError('That name is too long.');
    if (!muscle) return setError('Pick the main muscle.');
    const library = readCache<{ rows: Exercise[] }>('library')?.rows ?? [];
    if (library.some((e) => e.name.toLowerCase() === clean.toLowerCase())) {
      return setError(`\u201c${clean}\u201d already exists. Pick it from the list instead.`);
    }
    const row = { id: newId(), name: clean, primary_muscle: muscle, equipment, kind, secondary_muscles: [], created_by: userId };
    enqueue({ kind: 'insert', table: 'exercises', values: row });
    usePicker.getState().setCreated(row as unknown as Exercise);
    router.back();
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: Space.lg, gap: Space.lg }} keyboardShouldPersistTaps="handled">
        <Field label="Name" value={name} onChangeText={setName} placeholder="Incline Press (Dumbbell)" />
        <Group title="Main muscle">
          {Object.entries(MUSCLE_LABELS).map(([k, label]) => (
            <Chip key={k} label={label} selected={muscle === k} onPress={() => setMuscle(k)} />
          ))}
        </Group>
        <Group title="Equipment">
          {EQUIPMENT.map(([k, label]) => (
            <Chip key={k} label={label} selected={equipment === k} onPress={() => setEquipment(k)} />
          ))}
        </Group>
        <Group title="How it's logged">
          {KINDS.map(([k, label]) => (
            <Chip key={k} label={label} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </Group>
        {error ? (
          <AppText variant="smallBold" color="danger">
            {error}
          </AppText>
        ) : null}
        <Button label="Create exercise" size="lg" onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Space.sm }}>
      <AppText variant="smallBold" color="textMuted">
        {title}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm }}>{children}</View>
    </View>
  );
}
