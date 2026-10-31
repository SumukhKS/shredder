import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { OptionCard } from '@/components/ui/chips';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { WheelField } from '@/components/ui/wheel-field';
import { Space } from '@/constants/theme';
import { ageFrom } from '@/lib/profile';
import { ACTIVITY, computeTargets, DEFAULT_SPLIT, GOALS, macroSplit, scaleMacros } from '@/lib/nutrition';
import { formatWeight, fromCm, toCm } from '@/lib/units';
import { useAppSettings } from '@/stores/app-settings';
import { parseAmount } from '@/lib/validate';
import { useSession } from '@/stores/session';

/** Settings > Profile: body details used for targets, then the calorie, macro and habit goals. */
export default function ProfileSettings() {
  const { profile, updateProfile } = useSession();
  const { weightUnit, lengthUnit } = useAppSettings();
  const [form, setForm] = useState(() => ({
    height: profile?.height_cm ? String(Math.round(fromCm(Number(profile.height_cm), lengthUnit) * 10) / 10) : '',
    activity_level: profile?.activity_level ?? null,
    goal: profile?.goal ?? null,
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
  // The split is remembered, so changing calories rescales the macros without flattening it.
  const [split, setSplit] = useState(
    () =>
      macroSplit({ protein: profile?.protein_g ?? 0, carbs: profile?.carbs_g ?? 0, fat: profile?.fat_g ?? 0 }) ?? DEFAULT_SPLIT
  );

  if (!profile) return null;
  const set = (k: Exclude<keyof typeof form, 'activity_level' | 'goal'>) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const heightCm = Math.round(toCm(parseAmount(form.height) ?? 0, lengthUnit) * 10) / 10;
  const int = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  // Calories and macros stay consistent: changing calories rescales the macros at the
  // same split, and changing a macro updates calories (4 kcal/g protein and carbs, 9 fat).
  function setCalories(v: string) {
    const digits = v.replace(/[^0-9]/g, '');
    setForm((f) => {
      if (!digits) return { ...f, calorie_target: digits };
      const m = scaleMacros(split, int(digits));
      return { ...f, calorie_target: digits, protein_g: String(m.protein), carbs_g: String(m.carbs), fat_g: String(m.fat) };
    });
  }
  const setMacro = (k: 'protein_g' | 'carbs_g' | 'fat_g') => (v: string) => {
    const digits = v.replace(/[^0-9]/g, '');
    setForm((f) => {
      const next = { ...f, [k]: digits };
      const macros = { protein: int(next.protein_g), carbs: int(next.carbs_g), fat: int(next.fat_g) };
      setSplit(macroSplit(macros) ?? DEFAULT_SPLIT);
      return { ...next, calorie_target: String(macros.protein * 4 + macros.carbs * 4 + macros.fat * 9) };
    });
  };

  function recalc() {
    if (
      !profile?.sex ||
      !(profile.birthday || profile.birth_year) ||
      !heightCm ||
      !profile.weight_kg ||
      !form.activity_level ||
      !form.goal
    ) {
      setMessage('Add your gender and birthday (Edit profile), height, activity and goal to recalculate.');
      return;
    }
    const t = computeTargets({
      sex: profile.sex,
      age: profile.birthday ? ageFrom(profile.birthday) : new Date().getFullYear() - (profile.birth_year ?? 0),
      heightCm,
      weightKg: Number(profile.weight_kg),
      activity: form.activity_level,
      goal: form.goal,
    });
    setForm((f) => ({
      ...f,
      calorie_target: String(t.calories),
      protein_g: String(t.protein),
      carbs_g: String(t.carbs),
      fat_g: String(t.fat),
      water_ml_target: String(t.water),
    }));
    setSplit(macroSplit(t) ?? DEFAULT_SPLIT);
    setMessage(`Recalculated from your latest weight, ${formatWeight(Number(profile.weight_kg), weightUnit)}. Save to apply.`);
  }

  async function save() {
    const calories = int(form.calorie_target);
    const fromMacros = int(form.protein_g) * 4 + int(form.carbs_g) * 4 + int(form.fat_g) * 9;
    if (calories < 800 || calories > 10000) return setMessage('Enter a calorie target between 800 and 10,000.');
    if (Math.abs(calories - fromMacros) > Math.max(50, calories * 0.05)) {
      return setMessage(
        `Your macros add up to ${fromMacros.toLocaleString()} kcal, not ${calories.toLocaleString()}. Adjust them to match.`
      );
    }
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile({
        height_cm: heightCm || null,
        activity_level: form.activity_level,
        goal: form.goal,
        calorie_target: int(form.calorie_target),
        protein_g: int(form.protein_g),
        carbs_g: int(form.carbs_g),
        fat_g: int(form.fat_g),
        water_ml_target: int(form.water_ml_target),
        steps_target: int(form.steps_target),
        sleep_min_target: Math.round((parseAmount(form.sleep_h) || 8) * 60),
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
      <SectionHeader title="Body" />
      <WheelField
        label="Height"
        value={form.height}
        onChange={set('height')}
        {...(lengthUnit === 'cm' ? { min: 100, max: 250, start: 170 } : { min: 40, max: 100, start: 67, step: 0.5 })}
        suffix={lengthUnit}
      />
      <AppText variant="smallBold" color="textMuted">
        Goal
      </AppText>
      {GOALS.map((g) => (
        <OptionCard
          key={g.key}
          title={g.title}
          detail={g.detail}
          selected={form.goal === g.key}
          onPress={() => setForm((f) => ({ ...f, goal: g.key }))}
        />
      ))}
      <AppText variant="smallBold" color="textMuted">
        Activity
      </AppText>
      {ACTIVITY.map((a) => (
        <OptionCard
          key={a.key}
          title={a.title}
          detail={a.detail}
          selected={form.activity_level === a.key}
          onPress={() => setForm((f) => ({ ...f, activity_level: a.key }))}
        />
      ))}

      <SectionHeader title="Nutrition" action={<Button label="Recalculate" size="sm" variant="secondary" onPress={recalc} />} />
      <WheelField
        label="Calories"
        value={form.calorie_target}
        onChange={setCalories}
        min={800}
        max={10000}
        step={10}
        start={2000}
        suffix="kcal"
        hint={`Protein ${split.protein}%, carbs ${split.carbs}%, fat ${split.fat}% of calories. Change either and the other follows.`}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <WheelField
            label="Protein"
            value={form.protein_g}
            onChange={setMacro('protein_g')}
            min={0}
            max={1000}
            start={150}
            suffix="g"
          />
        </View>
        <View style={{ flex: 1 }}>
          <WheelField
            label="Carbs"
            value={form.carbs_g}
            onChange={setMacro('carbs_g')}
            min={0}
            max={1500}
            start={200}
            suffix="g"
          />
        </View>
        <View style={{ flex: 1 }}>
          <WheelField label="Fat" value={form.fat_g} onChange={setMacro('fat_g')} min={0} max={500} start={60} suffix="g" />
        </View>
      </View>

      <SectionHeader title="Daily habits" />
      <WheelField
        label="Water"
        value={form.water_ml_target}
        onChange={set('water_ml_target')}
        min={500}
        max={10000}
        step={50}
        start={3000}
        suffix="ml"
      />
      <WheelField
        label="Steps"
        value={form.steps_target}
        onChange={set('steps_target')}
        min={1000}
        max={50000}
        step={500}
        start={10000}
        suffix="steps"
      />
      <WheelField
        label="Sleep"
        value={form.sleep_h}
        onChange={set('sleep_h')}
        min={3}
        max={14}
        step={0.25}
        start={8}
        suffix="hours"
      />

      {message ? (
        <AppText variant="smallBold" color="textMuted">
          {message}
        </AppText>
      ) : null}
      <Button label="Save changes" size="lg" loading={saving} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.md },
});
