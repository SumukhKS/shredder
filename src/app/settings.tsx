import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import * as Updates from 'expo-updates';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { checkForAppUpdate } from '@/components/update-banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Screen, SectionHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import { backfillHealth, connectHealth, healthStatus, openHealthSettings, type HealthStatus } from '@/lib/health';
import { computeTargets, DEFAULT_SPLIT, macroSplit, scaleMacros } from '@/lib/nutrition';
import { useAppSettings } from '@/stores/app-settings';
import { useSession } from '@/stores/session';

export default function Settings() {
  const c = useColors();
  const { profile, updateProfile, signOut, session } = useSession();
  const { autoUpdate, setAutoUpdate } = useAppSettings();
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
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthNote, setHealthNote] = useState<string | null>(null);
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // The split is remembered while typing calories, so "2", "25", "250"... don't flatten it.
  const [split, setSplit] = useState(
    () =>
      macroSplit({ protein: profile?.protein_g ?? 0, carbs: profile?.carbs_g ?? 0, fat: profile?.fat_g ?? 0 }) ?? DEFAULT_SPLIT
  );

  useFocusEffect(
    useCallback(() => {
      healthStatus()
        .then(setHealth)
        .catch(() => setHealth('unsupported'));
    }, [])
  );

  if (!profile) return null;
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
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

  async function connect() {
    setHealthNote(null);
    const status = await connectHealth();
    setHealth(status);
    if (status === 'connected' && session) {
      await backfillHealth(session.user.id, toDay());
      setHealthNote('Connected. Steps and sleep sync each time you open Today.');
    } else if (status === 'disconnected') {
      setHealthNote('Allow steps and sleep in Health Connect to sync them.');
    }
  }

  async function checkUpdates() {
    setChecking(true);
    setUpdateNote(null);
    try {
      const r = await checkForAppUpdate();
      if (r === 'available') {
        setUpdateNote('Downloading the new version...');
        await Updates.fetchUpdateAsync();
        setUpdateNote('Downloaded. Tap Update ready to restart into it.');
      } else {
        setUpdateNote(r === 'none' ? 'You have the latest version.' : 'Updates are off in development builds.');
      }
    } catch {
      setUpdateNote('Could not reach the update server. Check your connection.');
    } finally {
      setChecking(false);
    }
  }

  function recalc() {
    if (
      !profile?.sex ||
      !profile.birth_year ||
      !profile.height_cm ||
      !profile.weight_kg ||
      !profile.activity_level ||
      !profile.goal
    )
      return;
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
    setSplit(macroSplit(t) ?? DEFAULT_SPLIT);
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
      <Field
        label="Calories"
        value={form.calorie_target}
        onChangeText={setCalories}
        keyboardType="number-pad"
        suffix="kcal"
        hint={`Protein ${split.protein}%, carbs ${split.carbs}%, fat ${split.fat}% of calories. Change either and the other follows.`}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field
            label="Protein"
            value={form.protein_g}
            onChangeText={setMacro('protein_g')}
            keyboardType="number-pad"
            suffix="g"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Carbs" value={form.carbs_g} onChangeText={setMacro('carbs_g')} keyboardType="number-pad" suffix="g" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Fat" value={form.fat_g} onChangeText={setMacro('fat_g')} keyboardType="number-pad" suffix="g" />
        </View>
      </View>

      <SectionHeader title="Daily habits" />
      <Field
        label="Water"
        value={form.water_ml_target}
        onChangeText={set('water_ml_target')}
        keyboardType="number-pad"
        suffix="ml"
      />
      <Field
        label="Steps"
        value={form.steps_target}
        onChangeText={set('steps_target')}
        keyboardType="number-pad"
        suffix="steps"
      />
      <Field label="Sleep" value={form.sleep_h} onChangeText={set('sleep_h')} keyboardType="decimal-pad" suffix="hours" />

      {message ? (
        <AppText variant="smallBold" color="textMuted">
          {message}
        </AppText>
      ) : null}
      <Button label="Save changes" size="lg" loading={saving} onPress={save} />

      <SectionHeader title="Devices and apps" />
      <Card tone="flat" style={{ gap: Space.md }}>
        <AppText variant="small" color="textMuted">
          Steps and sleep come from Health Connect, the shared health store on Android. Fitbit, Samsung Health, Google Fit,
          Garmin, Mi Fitness and most smartwatches can write to it: turn on Health Connect sync in that app once.
        </AppText>
        <AppText variant="bodyBold">{HEALTH_LABELS[health ?? 'checking']}</AppText>
        {health === 'disconnected' ? <Button label="Connect" icon="watch-outline" variant="secondary" onPress={connect} /> : null}
        {health === 'connected' ? (
          <Button label="Choose which apps share data" icon="options-outline" variant="secondary" onPress={openHealthSettings} />
        ) : null}
        {health === 'not_installed' || health === 'needs_update' ? (
          <AppText variant="small" color="textMuted">
            Get Health Connect from the Play Store, then come back here.
          </AppText>
        ) : null}
        {healthNote ? (
          <AppText variant="small" color="textMuted">
            {healthNote}
          </AppText>
        ) : null}
      </Card>

      <SectionHeader title="Your data" />
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

      <SectionHeader title="App updates" />
      <Card tone="flat" style={{ gap: Space.md }}>
        <AppText variant="small" color="textMuted">
          Version {Constants.expoConfig?.version ?? '1.0.0'}
          {Updates.updateId ? `, update ${Updates.updateId.slice(0, 8)}` : ', as installed'}
          {Updates.createdAt ? ` from ${Updates.createdAt.toLocaleDateString()}` : ''}.
        </AppText>
        <View style={styles.toggle}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyBold">Auto-update</AppText>
            <AppText variant="small" color="textMuted">
              {autoUpdate
                ? 'New versions download by themselves; you choose when to restart into them.'
                : 'You are asked before anything is downloaded.'}
            </AppText>
          </View>
          <Switch
            accessibilityLabel="Auto-update"
            value={autoUpdate}
            onValueChange={setAutoUpdate}
            trackColor={{ false: c.border, true: c.primary }}
            thumbColor={c.text}
          />
        </View>
        <Button
          label="Check for updates"
          icon="cloud-download-outline"
          variant="secondary"
          loading={checking}
          onPress={checkUpdates}
        />
        {updateNote ? (
          <AppText variant="small" color="textMuted">
            {updateNote}
          </AppText>
        ) : null}
      </Card>

      <Card tone="flat" style={{ gap: Space.md, marginTop: Space.lg }}>
        <AppText variant="small" color="textMuted">
          Signed in as {session?.user.email}
        </AppText>
        <Button label="Sign out" variant="danger" onPress={signOut} />
      </Card>
    </Screen>
  );
}

const HEALTH_LABELS: Record<HealthStatus | 'checking', string> = {
  connected: 'Connected to Health Connect',
  disconnected: 'Not connected',
  not_installed: 'Health Connect is not installed',
  needs_update: 'Health Connect needs an update',
  unsupported: 'Available on Android phones',
  checking: 'Checking...',
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.md },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
