import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { computeTargets } from '@/lib/nutrition';
import { useSession } from '@/stores/session';

export default function Settings() {
  const { profile, updateProfile, signOut, session } = useSession();
  const [form, setForm] = useState(() => ({
    display_name: profile?.display_name ?? '',
    calorie_target: String(profile?.calorie_target ?? ''),
    protein_g: String(profile?.protein_g ?? ''),
    carbs_g: String(profile?.carbs_g ?? ''),
    fat_g: String(profile?.fat_g ?? ''),
    water_ml_target: String(profile?.water_ml_target ?? ''),
    steps_target: String(profile?.steps_target ?? ''),
    sleep_h: String((profile?.sleep_min_target ?? 480) / 60),
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!profile) return null;
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const int = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  function recalc() {
    if (!profile?.sex || !profile.birth_year || !profile.height_cm || !profile.weight_kg || !profile.activity_level || !profile.goal) return;
    const t = computeTargets({
      sex: profile.sex,
      age: new Date().getFullYear() - profile.birth_year,
      heightCm: Number(profile.height_cm),
      weightKg: Number(profile.weight_kg),
      activity: profile.activity_level,
      goal: profile.goal,
    });
    setForm((f) => ({
      ...f,
      calorie_target: String(t.calories),
      protein_g: String(t.protein),
      carbs_g: String(t.carbs),
      fat_g: String(t.fat),
      water_ml_target: String(t.water),
    }));
    setMessage(`Recalculated from your latest weight, ${Number(profile.weight_kg)} kg. Save to apply.`);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile({
        display_name: form.display_name.trim() || null,
        calorie_target: int(form.calorie_target),
        protein_g: int(form.protein_g),
        carbs_g: int(form.carbs_g),
        fat_g: int(form.fat_g),
        water_ml_target: int(form.water_ml_target),
        steps_target: int(form.steps_target),
        sleep_min_target: Math.round((Number(form.sleep_h) || 8) * 60),
      });
      setMessage('Saved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen padTop={false}>
      <Field label="Name" value={form.display_name} onChangeText={set('display_name')} />

      <SectionHeader title="Nutrition" action={<Button label="Recalculate" size="sm" variant="secondary" onPress={recalc} />} />
      <Field label="Calories" value={form.calorie_target} onChangeText={set('calorie_target')} keyboardType="number-pad" suffix="kcal" />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="Protein" value={form.protein_g} onChangeText={set('protein_g')} keyboardType="number-pad" suffix="g" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Carbs" value={form.carbs_g} onChangeText={set('carbs_g')} keyboardType="number-pad" suffix="g" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Fat" value={form.fat_g} onChangeText={set('fat_g')} keyboardType="number-pad" suffix="g" />
        </View>
      </View>

      <SectionHeader title="Daily habits" />
      <Field label="Water" value={form.water_ml_target} onChangeText={set('water_ml_target')} keyboardType="number-pad" suffix="ml" />
      <Field label="Steps" value={form.steps_target} onChangeText={set('steps_target')} keyboardType="number-pad" suffix="steps" />
      <Field label="Sleep" value={form.sleep_h} onChangeText={set('sleep_h')} keyboardType="decimal-pad" suffix="hours" />

      {message ? <AppText variant="smallBold" color="textMuted">{message}</AppText> : null}
      <Button label="Save changes" size="lg" loading={saving} onPress={save} />

      <Card tone="flat" style={{ gap: Space.md, marginTop: Space.lg }}>
        <AppText variant="small" color="textMuted">Signed in as {session?.user.email}</AppText>
        <Button label="Sign out" variant="danger" onPress={signOut} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: Space.md } });
