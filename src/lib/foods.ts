import { supabase } from '@/lib/supabase';
import type { Food } from '@/types/db';

const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity,countries_tags';
const OFF_HEADERS = { 'User-Agent': 'Shredder/1.0 (fitness tracker app)' };

interface OffProduct {
  code?: string;
  product_name?: string;
  /** a comma-separated string from the product API, an array from search */
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
  countries_tags?: string[];
}

/** A food that may not be in our database yet (an Open Food Facts hit). */
export type FoodCandidate = Omit<Food, 'id'> & { id?: string };

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function fromOff(p: OffProduct): FoodCandidate | null {
  const n = p.nutriments ?? {};
  const kcal = num(n['energy-kcal_100g']) || num(n['energy_100g']) / 4.184;
  if (!p.product_name || !kcal) return null;
  const servingG = num(p.serving_quantity);
  const brand = Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0];
  return {
    name: p.product_name.trim(),
    brand: brand?.trim() || null,
    barcode: p.code ?? null,
    source: 'off',
    serving_label: servingG > 0 ? (p.serving_size ?? `${servingG} g`) : '100 g',
    serving_g: servingG > 0 ? servingG : 100,
    kcal_100g: Math.round(kcal * 10) / 10,
    protein_100g: num(n['proteins_100g']),
    carbs_100g: num(n['carbohydrates_100g']),
    fat_100g: num(n['fat_100g']),
  };
}

// Your own foods and the Indian dishes first, then cached products, then USDA basics.
const SOURCE_RANK: Record<Food['source'], number> = { custom: 0, seed: 1, off: 2, usda: 3 };

/**
 * Our own catalogue: seeded Indian dishes, USDA everyday foods, cached products, custom
 * foods. Every word must appear, so "chicken breast" finds "Chicken, broilers..., breast".
 */
export async function searchLocalFoods(query: string, limit = 25): Promise<Food[]> {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 6);
  let req = supabase.from('foods').select('*');
  if (!words.length) {
    const { data, error } = await req.eq('source', 'seed').order('name').limit(limit);
    if (error) throw error;
    return (data ?? []) as Food[];
  }
  for (const w of words) req = req.ilike('name', `%${w}%`);
  const { data, error } = await req.limit(150);
  if (error) throw error;
  const first = words[0];
  const score = (f: Food) => {
    const name = f.name.toLowerCase();
    return SOURCE_RANK[f.source] * 1000 + (name.startsWith(first) ? 0 : 500) + name.length;
  };
  return ((data ?? []) as Food[]).sort((a, b) => score(a) - score(b)).slice(0, limit);
}

/** Packaged foods from Open Food Facts, products sold in India first. */
export async function searchOpenFoodFacts(query: string, limit = 20): Promise<FoodCandidate[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url =
    `https://search.openfoodfacts.org/search?page_size=${limit * 2}` +
    `&fields=${OFF_FIELDS}&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: OFF_HEADERS });
    if (!res.ok) return [];
    const body = (await res.json()) as { hits?: OffProduct[] };
    const hits = [...(body.hits ?? [])].sort(
      (a, b) => Number(!!b.countries_tags?.includes('en:india')) - Number(!!a.countries_tags?.includes('en:india'))
    );
    // Many products have no nutrition filled in; those can't be logged.
    return hits
      .map(fromOff)
      .filter((f): f is FoodCandidate => f !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** Barcode lookup: our cache, then Open Food Facts. */
export async function lookupBarcode(barcode: string): Promise<FoodCandidate | null> {
  const { data } = await supabase.from('foods').select('*').eq('barcode', barcode).maybeSingle();
  if (data) return data as Food;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=${OFF_FIELDS}`, {
      headers: OFF_HEADERS,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: number; product?: OffProduct };
    if (body.status !== 1 || !body.product) return null;
    return fromOff({ ...body.product, code: body.product.code ?? barcode });
  } catch {
    return null;
  }
}

/** Make sure a candidate exists in our foods table and return its row. */
export async function ensureFood(candidate: FoodCandidate, userId: string): Promise<Food> {
  if (candidate.id) return candidate as Food;
  if (candidate.barcode) {
    const { data } = await supabase.from('foods').select('*').eq('barcode', candidate.barcode).maybeSingle();
    if (data) return data as Food;
  }
  const { data, error } = await supabase
    .from('foods')
    .insert({ ...candidate, created_by: userId })
    .select('*')
    .single();
  if (error) throw error;
  return data as Food;
}
