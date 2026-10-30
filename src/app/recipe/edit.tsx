import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { EmptyState, Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme';
import { Space } from '@/constants/theme';
import { recipeTotals, type Recipe, type RecipeItem } from '@/lib/recipe-math';
import { deleteRecipe, fetchRecipes, recipesWithWaiting, saveRecipe } from '@/lib/recipes';
import { readCache } from '@/lib/use-query';
import { cleanDecimal, parseAmount } from '@/lib/validate';
import { usePicker } from '@/stores/picker';

type Item = Omit<RecipeItem, 'id'> & { key: string };

let n = 0;
const key = () => `i${n++}`;

/** Create or edit a recipe: its ingredients and how many servings it makes. Private to you. */
export default function RecipeEditor() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState('');
  const [servings, setServings] = useState('1');
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchRecipes()
      .catch(() => readCache<Recipe[]>('recipes|') ?? [])
      .then((all) => {
        const r = recipesWithWaiting(all).find((x) => x.id === id);
        if (!r) return;
        setName(r.name);
        setServings(String(r.servings));
        setItems(
          [...r.recipe_items]
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map(({ food_id, food_name, grams, kcal, protein, carbs, fat }) => ({
              key: key(),
              food_id,
              food_name,
              grams,
              kcal,
              protein,
              carbs,
              fat,
            }))
        );
      });
  }, [id]);

  // Pick up the ingredient chosen in the food screens.
  useFocusEffect(
    useCallback(() => {
      const { ingredient, setIngredient } = usePicker.getState();
      if (ingredient) {
        setIngredient(null);
        setItems((list) => [...list, { ...ingredient, key: key() }]);
      }
    }, [])
  );

  const t = recipeTotals(items);
  const count = parseAmount(servings) ?? 0;

  function save() {
    if (!name.trim()) return setError('Give the recipe a name.');
    if (items.length === 0) return setError('Add at least one ingredient.');
    if (count <= 0 || count > 1000) return setError('Enter how many servings it makes.');
    saveRecipe({ id, name: name.trim(), servings: count, items: items.map(({ key: _key, ...item }) => item) });
    router.back();
  }

  function remove() {
    Alert.alert('Delete recipe?', 'Food you already logged from it stays in your diary.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteRecipe(id!);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen
      padTop={false}
      footer={
        <View
          style={{
            paddingHorizontal: Space.lg,
            paddingTop: Space.lg,
            paddingBottom: insets.bottom + Space.lg,
            borderTopWidth: 1,
            borderColor: c.hairline,
            backgroundColor: c.bg,
          }}>
          <Button label="Save recipe" size="lg" onPress={save} />
        </View>
      }>
      <Stack.Screen options={{ title: id ? 'Edit recipe' : 'New recipe' }} />
      <Field label="Name" value={name} onChangeText={setName} placeholder="Dal tadka" error={error} />
      <Field
        label="Servings it makes"
        value={servings}
        onChangeText={(v) => setServings(cleanDecimal(v))}
        keyboardType="decimal-pad"
        selectTextOnFocus
      />

      {items.length ? (
        <Card style={{ gap: Space.xs }}>
          <AppText variant="h3">
            {count > 0 ? Math.round(t.kcal / count).toLocaleString() : '-'} kcal per serving
          </AppText>
          <AppText variant="small" color="textMuted">
            {count > 0
              ? `Protein ${Math.round(t.protein / count)} g, carbs ${Math.round(t.carbs / count)} g, fat ${Math.round(t.fat / count)} g`
              : 'Enter the servings to see the numbers.'}
          </AppText>
        </Card>
      ) : (
        <EmptyState title="Add your ingredients" body="The calories and macros are worked out for you." />
      )}

      {items.map((item) => (
        <Card key={item.key} tone="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold" numberOfLines={2}>
              {item.food_name}
            </AppText>
            <AppText variant="small" color="textMuted">
              {Math.round(Number(item.grams)).toLocaleString()} g, {Math.round(Number(item.kcal)).toLocaleString()} kcal
            </AppText>
          </View>
          <IconButton
            icon="close"
            label={`Remove ${item.food_name}`}
            onPress={() => setItems((list) => list.filter((x) => x.key !== item.key))}
          />
        </Card>
      ))}

      <Button
        label="Add ingredient"
        icon="add"
        variant="secondary"
        onPress={() => router.push({ pathname: '/food/search', params: { mode: 'recipe' } })}
      />
      {id ? <Button label="Delete recipe" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}
