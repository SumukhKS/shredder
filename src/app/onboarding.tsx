import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OptionCard, Segmented } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { ProgressBar } from '@/components/ui/progress';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { computeTargets } from '@/lib/nutrition';
import { useSession } from '@/stores/session';
import type { ActivityLevel, Goal, Sex } from '@/types/db';

const GOALS: { key: Goal; title: string; detail: string }[] = [
  { key: 'cut', title: 'Lose fat', detail: 'Moderate deficit, high protein to keep muscle' },
  { key: 'maintain', title: 'Recomp and maintain', detail: 'Eat at maintenance, get stronger' },
  { key: 'bulk', title: 'Build muscle', detail: 'Small surplus for lean gains' },
];

const ACTIVITY: { key: ActivityLevel; title: string; detail: string }[] = [
  { key: 'sedentary', title: 'Mostly sitting', detail: 'Desk job, little walking' },
  { key: 'light', title: 'Lightly active', detail: 'Training 1–3 days a week' },
  { key: 'moderate', title: 'Active', detail: 'Training 3–5 days a week' },
  { key: 'active', title: 'Very active', detail: 'Training 6–7 days or a physical job' },
  { key: 'athlete', title: 'Athlete', detail: 'Twice-a-day sessions' },
];

const STEPS = ['goal', 'body', 'activity', 'review'] as const;

export default function Onboarding() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { profile, updateProfile } = useSession();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>('cut');
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageN = Number(age);
  const heightN = Number(height);
  const weightN = Number(weight);
  const bodyValid = ageN >= 13 && ageN <= 90 && heightN >= 120 && heightN <= 230 && weightN >= 30 && weightN <= 250;

  const targets = useMemo(
    () => (bodyValid ? computeTargets({ sex, age: ageN, heightCm: heightN, weightKg: weightN, activity, goal }) : null),
    [bodyValid, sex, ageN, heightN, weightN, activity, goal]
  );

  const current = STEPS[step];
  const canNext = current !== 'body' || bodyValid;

  async function finish() {
    if (!targets) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        goal,
        sex,
        birth_year: new Date().getFullYear() - ageN,
        height_cm: heightN,
        weight_kg: weightN,
        activity_level: activity,
        calorie_target: targets.calories,
        protein_g: targets.protein,
        carbs_g: targets.carbs,
        fat_g: targets.fat,
        water_ml_target: targets.water,
        onboarded: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + Space.md }]}>
        <View style={{ width: 32 }}>
          {step > 0 ? <IconButton icon="chevron-back" label="Back" onPress={() => setStep(step - 1)} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <ProgressBar value={(step + 1) / STEPS.length} color={c.primary} height={10} />
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {current === 'goal' ? (
          <>
            <AppText variant="h1">Hey {profile?.display_name ?? 'there'}, what are you training for?</AppText>
            <AppText color="textMuted">This sets your calories and protein. You can change it later.</AppText>
            <View style={{ gap: Space.md }}>
              {GOALS.map((g) => (
                <OptionCard key={g.key} title={g.title} detail={g.detail} selected={goal === g.key} onPress={() => setGoal(g.key)} />
              ))}
            </View>
          </>
        ) : null}

        {current === 'body' ? (
          <>
            <AppText variant="h1">A few numbers about you</AppText>
            <AppText color="textMuted">Used only to calculate your targets.</AppText>
            <Segmented<Sex>
              options={[
                { key: 'male', label: 'Male' },
                { key: 'female', label: 'Female' },
              ]}
              value={sex}
              onChange={setSex}
            />
            <Field label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="24" suffix="years" />
            <Field label="Height" value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="172" suffix="cm" />
            <Field label="Weight" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="74" suffix="kg" />
          </>
        ) : null}

        {current === 'activity' ? (
          <>
            <AppText variant="h1">How active is a normal week?</AppText>
            <View style={{ gap: Space.md }}>
              {ACTIVITY.map((a) => (
                <OptionCard key={a.key} title={a.title} detail={a.detail} selected={activity === a.key} onPress={() => setActivity(a.key)} />
              ))}
            </View>
          </>
        ) : null}

        {current === 'review' && targets ? (
          <>
            <AppText variant="h1">Your daily targets</AppText>
            <Card tone="hero" bg={c.primary}>
              <AppText variant="smallBold" color="#FFFFFF">
                Calories
              </AppText>
              <AppText variant="hero" color="#FFFFFF">
                {targets.calories.toLocaleString()}
              </AppText>
              <AppText variant="small" color="#FFFFFF" style={{ opacity: 0.85 }}>
                Maintenance is about {targets.tdee.toLocaleString()} kcal
              </AppText>
            </Card>
            <View style={styles.macroRow}>
              <Macro label="Protein" value={`${targets.protein} g`} color={c.protein} />
              <Macro label="Carbs" value={`${targets.carbs} g`} color={c.carbs} />
              <Macro label="Fat" value={`${targets.fat} g`} color={c.fat} />
            </View>
            <Card tone="flat">
              <AppText variant="bodyBold">
                Drink {targets.water / 1000} L of water, walk 8,000 steps and sleep 8 hours.
              </AppText>
              <AppText variant="small" color="textMuted">
                Hitting each one earns bonus XP every day.
              </AppText>
            </Card>
            {error ? (
              <AppText variant="small" color="danger">
                {error}
              </AppText>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Space.lg }]}>
        {current === 'review' ? (
          <Button label="Start training" size="lg" icon="flash" loading={saving} onPress={finish} />
        ) : (
          <Button label="Continue" size="lg" disabled={!canNext} onPress={() => setStep(step + 1)} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Macro({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card style={{ flex: 1, gap: Space.xs }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <AppText variant="stat">{value}</AppText>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingHorizontal: Space.lg },
  body: { padding: Space.xl, gap: Space.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  footer: { paddingHorizontal: Space.xl, paddingTop: Space.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  macroRow: { flexDirection: 'row', gap: Space.md },
});
