// Recipe sums, with no React Native imports so tests can run them directly.

export interface RecipeItem {
  id: string;
  recipe_id?: string;
  position?: number;
  food_id: string | null;
  food_name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  recipe_items: RecipeItem[];
}

export function recipeTotals(items: Pick<RecipeItem, 'grams' | 'kcal' | 'protein' | 'carbs' | 'fat'>[]) {
  return items.reduce(
    (t, i) => ({
      grams: t.grams + Number(i.grams),
      kcal: t.kcal + Number(i.kcal),
      protein: t.protein + Number(i.protein),
      carbs: t.carbs + Number(i.carbs),
      fat: t.fat + Number(i.fat),
    }),
    { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

const per100 = (value: number, grams: number) => (grams > 0 ? (value / grams) * 100 : 0);

/** A recipe in the shape of a food, so it can be logged by the serving like any other. */
export function recipeAsFood(r: Recipe) {
  const t = recipeTotals(r.recipe_items);
  return {
    recipe_id: r.id,
    name: r.name,
    brand: null,
    barcode: null,
    source: 'custom' as const,
    serving_label: '1 serving',
    serving_g: t.grams / Math.max(Number(r.servings), 0.1),
    kcal_100g: per100(t.kcal, t.grams),
    protein_100g: per100(t.protein, t.grams),
    carbs_100g: per100(t.carbs, t.grams),
    fat_100g: per100(t.fat, t.grams),
  };
}
