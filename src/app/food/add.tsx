import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import { ensureFood, type FoodCandidate } from '@/lib/foods';
import { macrosFor, MEALS } from '@/lib/nutrition';
import { refreshStreaks } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { parseAmount } from '@/lib/validate';
import { useSession } from '@/stores/session';
import type { Meal } from '@/types/db';

type Unit = 'serving' | 'grams';

export default function AddFood() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ food: string; day?: string; meal?: string }>();
  const userId = useSession((s) => s.session?.user.id);
  const food = useMemo(() => JSON.parse(params.food) as FoodCandidate, [params.food]);
  const [unit, setUnit] = useState<Unit>(food.serving_label === '100 g' ? 'grams' : 'serving');
  const [amount, setAmount] = useState(food.serving_label === '100 g' ? '100' : '1');
  const [meal, setMeal] = useState<Meal>((params.meal as Meal) ?? 'snacks');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = parseAmount(amount) ?? 0;
  const grams = unit === 'grams' ? qty : qty * food.serving_g;
  const m = macrosFor(food, grams);

  async function log() {
    if (!userId) return;
    if (grams <= 0) return setError('Enter an amount.');
    if (grams > 100000) return setError('That amount is too large.');
    setSaving(true);
    setError(null);
    try {
      const row = await ensureFood(food, userId);
      const { error } = await supabase.from('food_logs').insert({
        day: params.day ?? toDay(),
        meal,
        food_id: row.id,
        food_name: row.brand ? `${row.name} (${row.brand})` : row.name,
        grams: Math.round(grams * 10) / 10,
        ...m,
      });
      if (error) throw error;
      refreshStreaks();
      router.dismissTo('/fuel');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log this food.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: Space.lg, gap: Space.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 2 }}>
          <AppText variant="h1">{food.name}</AppText>
          <AppText color="textMuted">
            {food.brand ? `${food.brand}, ` : ''}
            {Math.round(food.kcal_100g)} kcal per 100 g
          </AppText>
        </View>

        <Card tone="hero" filled style={{ gap: Space.md }}>
          <AppText variant="hero" color="onPrimary">
            {Math.round(m.kcal)} kcal
          </AppText>
          <View style={styles.row}>
            <MacroChip label="Protein" value={m.protein} color={c.protein} />
            <MacroChip label="Carbs" value={m.carbs} color={c.carbs} />
            <MacroChip label="Fat" value={m.fat} color={c.fat} />
          </View>
        </Card>

        <Segmented<Unit>
          options={[
            { key: 'serving', label: food.serving_label },
            { key: 'grams', label: 'Grams' },
          ]}
          value={unit}
          onChange={(u) => {
            setUnit(u);
            setAmount(
              u === 'grams'
                ? String(Math.round(grams || food.serving_g))
                : String(Math.round(((grams || food.serving_g) / food.serving_g) * 4) / 4 || 1)
            );
          }}
        />
        <Field
          label={unit === 'grams' ? 'Amount' : 'Servings'}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          suffix={unit === 'grams' ? 'g' : `× ${food.serving_label}`}
          hint={unit === 'serving' ? `${Math.round(grams)} g total` : undefined}
          error={error}
          selectTextOnFocus
        />

        <View style={{ gap: Space.sm }}>
          <AppText variant="smallBold" color="textMuted">
            Meal
          </AppText>
          <Segmented<Meal> options={MEALS.map((x) => ({ key: x.key, label: x.label }))} value={meal} onChange={setMeal} />
        </View>

        <Button label="Log food" size="lg" icon="checkmark" loading={saving} onPress={log} />
        {food.source === 'off' ? (
          <AppText variant="small" color="textMuted" align="center">
            Nutrition data from Open Food Facts, a community database.
          </AppText>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  const c = useColors();
  return (
    <View style={[styles.chip, { backgroundColor: 'rgba(0,0,0,0.08)' }]}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color, borderWidth: 1, borderColor: c.onPrimary }} />
      <AppText variant="smallBold" color="onPrimary">
        {Math.round(value)}g {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
});
