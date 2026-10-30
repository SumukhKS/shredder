import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { cleanDecimal, foodProblem, parseAmount } from '@/lib/validate';
import { useSession } from '@/stores/session';

export default function CustomFood() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; barcode?: string; day?: string; meal?: string }>();
  const userId = useSession((s) => s.session?.user.id);
  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState('');
  const [servingLabel, setServingLabel] = useState('1 serving');
  const [servingG, setServingG] = useState('100');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fibre, setFibre] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => parseAmount(s) ?? 0;

  async function save() {
    if (!userId) return;
    const g = num(servingG);
    if (!name.trim()) return setError('Name the food.');
    if (g <= 0) return setError('Enter the serving size in grams.');
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
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from('foods')
      .insert({
        ...numbers,
        brand: brand.trim() || null,
        barcode: params.barcode || null,
        source: 'custom',
        serving_label: servingLabel.trim() || `${g} g`,
        serving_g: g,
        created_by: userId,
      })
      .select('*')
      .single();
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.replace({ pathname: '/food/add', params: { food: JSON.stringify(data), day: params.day, meal: params.meal } });
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
        <Button label="Save and log" size="lg" loading={saving} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: Space.md } });
