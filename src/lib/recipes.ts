import { enqueue, waitingEntries } from '@/lib/outbox';
import { applyPending, newId } from '@/lib/outbox-core';
import type { Recipe, RecipeItem } from '@/lib/recipe-math';
import { supabase } from '@/lib/supabase';
import { writeCache } from '@/lib/use-query';
import type { Food } from '@/types/db';

export async function fetchRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, name, servings, recipe_items(*)')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Recipe[];
}

/** Recipes with what's still waiting to be sent applied. For useQuery's `overlay`. */
export function recipesWithWaiting(recipes: Recipe[]): Recipe[] {
  const entries = waitingEntries();
  if (entries.length === 0) return recipes;
  const list = applyPending(recipes as unknown as Record<string, unknown>[], entries, 'recipes') as unknown as Recipe[];
  return list.map((r) => ({
    ...r,
    recipe_items: applyPending(
      (r.recipe_items ?? []) as unknown as Record<string, unknown>[],
      entries,
      'recipe_items',
      (row) => row.recipe_id === r.id
    ) as unknown as RecipeItem[],
  }));
}

export function saveRecipe(params: { id?: string; name: string; servings: number; items: Omit<RecipeItem, 'id'>[] }) {
  const id = params.id ?? newId();
  const updated_at = new Date().toISOString();
  if (params.id) {
    enqueue({
      kind: 'update',
      table: 'recipes',
      values: { name: params.name, servings: params.servings, updated_at },
      match: { id },
    });
    enqueue({ kind: 'delete', table: 'recipe_items', match: { recipe_id: id } });
  } else {
    enqueue({ kind: 'insert', table: 'recipes', values: { id, name: params.name, servings: params.servings, updated_at } });
  }
  enqueue({
    kind: 'insert',
    table: 'recipe_items',
    values: params.items.map((item, i) => ({ ...item, id: newId(), recipe_id: id, position: i + 1 })),
  });
  return id;
}

export const deleteRecipe = (id: string) => enqueue({ kind: 'delete', table: 'recipes', match: { id } });

/** The foods you created. */
export async function fetchMyFoods(userId: string): Promise<Food[]> {
  const { data, error } = await supabase.from('foods').select('*').eq('created_by', userId).eq('source', 'custom').order('name');
  if (error) throw error;
  // For food search without a connection.
  writeCache('my-foods', data ?? []);
  return (data ?? []) as Food[];
}

export function foodsWithWaiting(foods: Food[]): Food[] {
  const entries = waitingEntries();
  if (entries.length === 0) return foods;
  return applyPending(foods as unknown as Record<string, unknown>[], entries, 'foods') as unknown as Food[];
}
