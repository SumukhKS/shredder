import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { discardEntry, enqueue, trySend } from '@/lib/outbox';
import { newId } from '@/lib/outbox-core';
import { cleanDecimal, foodProblem, parseAmount } from '@/lib/validate';
import { searchLocalFoods } from '@/lib/foods';
import { useSession } from '@/stores/session';
import type { Food } from '@/types/db';

export default function CustomFood() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    name?: string;
    barcode?: string;
    day?: string;
    meal?: string;
    mode?: 'recipe';
    /** A food of yours to edit (JSON). */
    food?: string;
    /** Opened from My Foods: go back there afterwards rather than on to logging. */
    from?: 'foods';
  }>();
  const [editing] = useState<Food | null>(() => (params.food ? (JSON.parse(params.food) as Food) : null));
  const servingOf = (per100g: number | null | undefined) =>
    editing && per100g != null ? String(Math.round(((per100g * editing.serving_g) / 100) * 10) / 10) : '';
  const [similar, setSimilar] = useState<Food[] | null>(null);
  const userId = useSession((s) => s.session?.user.id);
  const [name, setName] = useState(editing?.name ?? params.name ?? '');
  const [brand, setBrand] = useState(editing?.brand ?? '');
  const [servingLabel, setServingLabel] = useState(editing?.serving_label ?? '1 serving');
  const [servingG, setServingG] = useState(editing ? String(editing.serving_g) : '100');
  const [kcal, setKcal] = useState(servingOf(editing?.kcal_100g));
  const [protein, setProtein] = useState(servingOf(editing?.protein_100g));
  const [carbs, setCarbs] = useState(servingOf(editing?.carbs_100g));
  const [fat, setFat] = useState(servingOf(editing?.fat_100g));
  const [fibre, setFibre] = useState(servingOf(editing?.fiber_100g));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => parseAmount(s) ?? 0;

  async function save(skipSimilar = false) {
    if (!userId) return;
    const g = num(servingG);
    if (!name.trim()) return setError('Name the food.');
    if (g <= 0 || g > 100000) return setError('Enter the serving size in grams.');
    if (num(kcal) <= 0) return setError('Enter the calories per serving.');
    for (const v of [kcal, protein, carbs, fat, fibre]) {
      if (v.trim() && parseAmount(v) == null) return setError('Calories and macros must be numbers.');
    }
    const per100 = (v: string) => Math.round((num(v) / g) * 1000) / 10;
    const numbers = {
      name: name.trim(),
      kcal_100g: per100(kcal),
      protein_100g: per100(protein),
      carbs_100g: per100(carbs),
      fat_100g: per100(fat),
      fiber_100g: fibre.trim() ? per100(fibre) : null,
    };
    const problem = foodProblem(numbers);
    if (problem) return setError(problem);
    setError(null);
    setSaving(true);
    // Foods are shared with everyone, so check first that this one isn't there already.
    if (!editing && !skipSimilar) {
      const found = await searchLocalFoods(name).catch(() => []);
      if (found.length) {
        setSimilar(found.slice(0, 3));
        setSaving(false);
        return;
      }
    }
    if (editing) {
      const row = { ...numbers, brand: brand.trim() || null, serving_label: servingLabel.trim() || `${g} g`, serving_g: g };
      const entry = enqueue({ kind: 'update', table: 'foods', values: row, match: { id: editing.id } });
      const sent = await trySend(entry, 6000);
      if (sent.state === 'refused') {
        discardEntry(entry.id);
        setError(sent.reason);
        setSaving(false);
        return;
      }
      router.back();
      return;
    }
    const food = {
      ...numbers,
      id: newId(),
      brand: brand.trim() || null,
      barcode: params.barcode || null,
      source: 'custom' as const,
      serving_label: servingLabel.trim() || `${g} g`,
      serving_g: g,
      created_by: userId,
    };
    const entry = enqueue({ kind: 'insert', table: 'foods', values: food });
    const sent = await trySend(entry, 6000);
    if (sent.state === 'refused') {
      discardEntry(entry.id);
      setError(sent.reason);
      setSaving(false);
      return;
    }
    if (params.from === 'foods') return router.back();
    router.replace({
      pathname: '/food/add',
      params: { food: JSON.stringify(food), day: params.day, meal: params.meal, mode: params.mode },
    });
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: Space.lg, gap: Space.lg }} keyboardShouldPersistTaps="handled">
        {params.barcode ? (
          <AppText variant="small" color="textMuted">
            Barcode {params.barcode}
          </AppText>
        ) : null}
        <Field label="Name" value={name} onChangeText={setName} placeholder="Mom's rajma chawal" />
        <Field label="Brand (optional)" value={brand} onChangeText={setBrand} />
        <View style={styles.row}>
          <View style={{ flex: 1.4 }}>
            <Field label="Serving name" value={servingLabel} onChangeText={setServingLabel} placeholder="1 bowl" />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Serving size"
              value={servingG}
              onChangeText={(t) => setServingG(cleanDecimal(t))}
              keyboardType="decimal-pad"
              suffix="g"
            />
          </View>
        </View>
        <AppText variant="h3">Per serving</AppText>
        <Field
          label="Calories"
          value={kcal}
          onChangeText={(t) => setKcal(cleanDecimal(t))}
          keyboardType="decimal-pad"
          suffix="kcal"
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field
              label="Protein"
              value={protein}
              onChangeText={(t) => setProtein(cleanDecimal(t))}
              keyboardType="decimal-pad"
              suffix="g"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Carbs"
              value={carbs}
              onChangeText={(t) => setCarbs(cleanDecimal(t))}
              keyboardType="decimal-pad"
              suffix="g"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Fat" value={fat} onChangeText={(t) => setFat(cleanDecimal(t))} keyboardType="decimal-pad" suffix="g" />
          </View>
        </View>
        <Field
          label="Fibre (optional)"
          value={fibre}
          onChangeText={(t) => setFibre(cleanDecimal(t))}
          keyboardType="decimal-pad"
          suffix="g"
        />
        {error ? (
          <AppText variant="smallBold" color="danger">
            {error}
          </AppText>
        ) : null}
        {similar ? (
          <Card style={{ gap: Space.sm }}>
            <AppText variant="bodyBold">Already in Shredder?</AppText>
            {similar.map((f) => (
              <AppText key={f.id} variant="small" color="textMuted" numberOfLines={2}>
                {f.name}
                {f.brand ? ` (${f.brand})` : ''}, {f.serving_label},{' '}
                {Math.round((Number(f.kcal_100g) * Number(f.serving_g)) / 100).toLocaleString()} kcal
              </AppText>
            ))}
            <Button label="Save mine anyway" variant="secondary" loading={saving} onPress={() => save(true)} />
          </Card>
        ) : (
          <Button
            label={editing || params.from === 'foods' ? 'Save food' : 'Save and log'}
            size="lg"
            loading={saving}
            onPress={() => save()}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: Space.md } });
