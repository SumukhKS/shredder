import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Radius, Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import { searchLocalFoods, searchOpenFoodFacts, type FoodCandidate } from '@/lib/foods';
import { suggestMeal } from '@/lib/nutrition';
import { supabase } from '@/lib/supabase';
import type { Food } from '@/types/db';

export default function FoodSearch() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string; meal?: string }>();
  const day = params.day ?? toDay();
  const meal = params.meal ?? suggestMeal();
  const [query, setQuery] = useState('');
  const [local, setLocal] = useState<Food[]>([]);
  const [recent, setRecent] = useState<Food[]>([]);
  const [remote, setRemote] = useState<FoodCandidate[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);

  // Recently logged foods (shown before typing)
  useEffect(() => {
    supabase
      .from('food_logs')
      .select('food_id, foods(*)')
      .not('food_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => {
        const seen = new Set<string>();
        const foods: Food[] = [];
        for (const row of (data ?? []) as unknown as { foods: Food | null }[]) {
          if (row.foods && !seen.has(row.foods.id)) {
            seen.add(row.foods.id);
            foods.push(row.foods);
          }
        }
        setRecent(foods.slice(0, 10));
      });
  }, []);

  // Debounced search: our catalogue immediately, Open Food Facts after a pause
  useEffect(() => {
    let cancelled = false;
    const t1 = setTimeout(() => {
      searchLocalFoods(query).then((r) => !cancelled && setLocal(r)).catch(() => {});
    }, 150);
    const t2 =
      query.trim().length >= 3
        ? setTimeout(() => {
            setSearchingRemote(true);
            searchOpenFoodFacts(query)
              .then((r) => !cancelled && setRemote(r))
              .finally(() => !cancelled && setSearchingRemote(false));
          }, 600)
        : undefined;
    return () => {
      cancelled = true;
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [query]);

  function open(food: FoodCandidate) {
    router.push({ pathname: '/food/add', params: { food: JSON.stringify(food), day, meal } });
  }

  const localBarcodes = new Set(local.map((f) => f.barcode).filter(Boolean));
  const sections = [
    ...(query.trim() === '' && recent.length ? [{ title: 'Recent', data: recent as FoodCandidate[] }] : []),
    { title: query.trim() ? 'Shredder foods' : 'Popular dishes', data: local as FoodCandidate[] },
    ...(remote.length
      ? [{ title: 'Packaged foods (Open Food Facts)', data: remote.filter((r) => !r.barcode || !localBarcodes.has(r.barcode)) }]
      : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Field
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setRemote([]);
            }} placeholder="Search dosa, paneer, oats..." autoCorrect={false} autoFocus />
        </View>
        <Button
          label="Scan"
          icon="barcode-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: '/food/scan', params: { day, meal } })}
        />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(f, i) => f.id ?? f.barcode ?? `${f.name}-${i}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: Space.lg, paddingBottom: 60, gap: Space.sm }}
        renderSectionHeader={({ section }) =>
          section.data.length ? (
            <AppText variant="smallBold" color="textMuted" style={{ marginTop: Space.md }}>
              {section.title}
            </AppText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => open(item)}
            style={({ pressed }) => [
              styles.item,
              { backgroundColor: pressed ? c.primarySoft : c.surface, borderColor: c.hairline },
            ]}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold" numberOfLines={1}>
                {item.name}
              </AppText>
              <AppText variant="small" color="textMuted" numberOfLines={1}>
                {item.brand ? `${item.brand}, ` : ''}
                {item.serving_label}, {Math.round((item.kcal_100g * item.serving_g) / 100)} kcal
              </AppText>
            </View>
            <Ionicons name="add-circle" size={26} color={c.primary} />
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ gap: Space.md, paddingTop: Space.lg, alignItems: 'center' }}>
            {searchingRemote ? <ActivityIndicator color={c.primary} /> : null}
            <Button
              label={query.trim() ? `Create “${query.trim()}”` : 'Create a custom food'}
              variant="ghost"
              icon="create-outline"
              onPress={() => router.push({ pathname: '/food/custom', params: { name: query.trim(), day, meal } })}
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, padding: Space.lg },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.row,
    borderWidth: 1.5,
  },
});
