import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { FoodDiary, useFoodDay } from '@/components/food-diary';
import { SwipeDays } from '@/components/swipe-days';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chips';
import { DayHeading, LoadError, EmptyState, Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { toDay } from '@/lib/dates';
import { enqueue } from '@/lib/outbox';
import { recipeAsFood, recipeTotals } from '@/lib/recipe-math';
import { fetchMyFoods, fetchRecipes, foodsWithWaiting, recipesWithWaiting } from '@/lib/recipes';
import { useQuery } from '@/lib/use-query';
import { useSession } from '@/stores/session';

type Category = 'diary' | 'recipes' | 'foods';

export default function Fuel() {
  const [category, setCategory] = useState<Category>('diary');
  const [day, setDay] = useState(toDay());
  const options = [
    { key: 'diary' as const, label: 'Diary' },
    { key: 'recipes' as const, label: 'My Recipes' },
    { key: 'foods' as const, label: 'My Foods' },
  ];
  const tabs = <Segmented<Category> options={options} value={category} onChange={setCategory} />;
  if (category === 'recipes') return <Recipes tabs={tabs} day={day} />;
  if (category === 'foods') return <Foods tabs={tabs} />;
  return <Diary tabs={tabs} day={day} setDay={setDay} />;
}

function Diary({ tabs, day, setDay }: { tabs: React.ReactNode; day: string; setDay: (d: string) => void }) {
  const q = useFoodDay(day);
  return (
    <Screen title="Food" refreshing={q.refreshing} onRefresh={q.refresh}>
      <LoadError q={q} what="your diary" />
      {tabs}
      <DayHeading day={day} />
      <SwipeDays day={day} onChange={setDay}>
        <FoodDiary day={day} data={q.data} />
      </SwipeDays>
    </Screen>
  );
}

function Recipes({ tabs, day }: { tabs: React.ReactNode; day: string }) {
  const router = useRouter();
  const q = useQuery(fetchRecipes, '', { cache: 'recipes', overlay: recipesWithWaiting });
  return (
    <Screen title="Food" refreshing={q.refreshing} onRefresh={q.refresh}>
      {tabs}
      <Button label="New recipe" icon="add" variant="secondary" onPress={() => router.push('/recipe/edit')} />
      {q.data?.length === 0 ? (
        <EmptyState title="No recipes yet" body="Save the dishes you cook, then log them by the serving." />
      ) : null}
      {!q.data && q.error ? (
        <EmptyState
          title="Couldn't load your recipes"
          body={q.error}
          action={<Button label="Try again" variant="secondary" icon="refresh" onPress={q.reload} />}
        />
      ) : null}
      {q.data?.map((r) => {
        const t = recipeTotals(r.recipe_items);
        const servings = Math.max(Number(r.servings), 0.1);
        return (
          <Card key={r.id} style={{ gap: Space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
              <View style={{ flex: 1 }}>
                <AppText variant="h3" numberOfLines={2}>
                  {r.name}
                </AppText>
                <AppText variant="small" color="textMuted">
                  {Math.round(t.kcal / servings).toLocaleString()} kcal per serving, P {Math.round(t.protein / servings)} C{' '}
                  {Math.round(t.carbs / servings)} F {Math.round(t.fat / servings)}
                </AppText>
              </View>
              <IconButton
                icon="create-outline"
                label={`Edit ${r.name}`}
                onPress={() => router.push({ pathname: '/recipe/edit', params: { id: r.id } })}
              />
            </View>
            <Button
              label="Log this recipe"
              icon="add"
              onPress={() => router.push({ pathname: '/food/add', params: { food: JSON.stringify(recipeAsFood(r)), day } })}
            />
          </Card>
        );
      })}
    </Screen>
  );
}

function Foods({ tabs }: { tabs: React.ReactNode }) {
  const router = useRouter();
  const userId = useSession((s) => s.session?.user.id) ?? '';
  // Cached under this name so food search can use them without a connection.
  const q = useQuery(() => fetchMyFoods(userId), '', { cache: 'my-foods-list', overlay: foodsWithWaiting });

  function remove(id: string, name: string) {
    Alert.alert(`Delete ${name}?`, 'Food you already logged keeps its numbers.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => enqueue({ kind: 'delete', table: 'foods', match: { id } }) },
    ]);
  }

  return (
    <Screen title="Food" refreshing={q.refreshing} onRefresh={q.refresh}>
      {tabs}
      <AppText variant="small" color="textMuted">
        Foods you create are shared with everyone using Shredder, so check the numbers against the label.
      </AppText>
      <Button
        label="Create food"
        icon="add"
        variant="secondary"
        onPress={() => router.push({ pathname: '/food/custom', params: { from: 'foods' } })}
      />
      {q.data?.length === 0 ? <EmptyState title="No foods yet" body="Add what you can't find in search." /> : null}
      {!q.data && q.error ? (
        <EmptyState
          title="Couldn't load your foods"
          body={q.error}
          action={<Button label="Try again" variant="secondary" icon="refresh" onPress={q.reload} />}
        />
      ) : null}
      {q.data?.map((f) => (
        <Card key={f.id} tone="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold" numberOfLines={2}>
              {f.name}
            </AppText>
            <AppText variant="small" color="textMuted">
              {f.serving_label}, {Math.round((Number(f.kcal_100g) * Number(f.serving_g)) / 100).toLocaleString()} kcal
            </AppText>
          </View>
          <IconButton
            icon="create-outline"
            label={`Edit ${f.name}`}
            onPress={() => router.push({ pathname: '/food/custom', params: { food: JSON.stringify(f), from: 'foods' } })}
          />
          <IconButton icon="trash-outline" label={`Delete ${f.name}`} onPress={() => remove(f.id, f.name)} />
        </Card>
      ))}
    </Screen>
  );
}
