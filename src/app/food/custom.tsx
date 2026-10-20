import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => Number(s.replace(',', '.')) || 0;

  async function save() {
    if (!userId) return;
    const g = num(servingG);
    if (!name.trim()) return setError('Name the food.');
    if (g <= 0) return setError('Enter the serving size in grams.');
    if (num(kcal) <= 0) return setError('Enter the calories per serving.');
    setSaving(true);
    setError(null);
    const per100 = (v: string) => Math.round((num(v) / g) * 1000) / 10;
    const { data, error } = await supabase
      .from('foods')
      .insert({
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: params.barcode || null,
        source: 'custom',
        serving_label: servingLabel.trim() || `${g} g`,
        serving_g: g,
        kcal_100g: per100(kcal),
        protein_100g: per100(protein),
        carbs_100g: per100(carbs),
        fat_100g: per100(fat),
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
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
            <Field label="Serving size" value={servingG} onChangeText={setServingG} keyboardType="decimal-pad" suffix="g" />
          </View>
        </View>
        <AppText variant="h3">Per serving</AppText>
        <Field label="Calories" value={kcal} onChangeText={setKcal} keyboardType="decimal-pad" suffix="kcal" />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Protein" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" suffix="g" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Carbs" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" suffix="g" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Fat" value={fat} onChangeText={setFat} keyboardType="decimal-pad" suffix="g" />
          </View>
        </View>
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
