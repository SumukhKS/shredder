import { supabase } from '@/lib/supabase';
import type { Food } from '@/types/db';

const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity';
const OFF_HEADERS = { 'User-Agent': 'Shredder/1.0 (fitness tracker app)' };

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
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
  return {
    name: p.product_name.trim(),
    brand: p.brands?.split(',')[0]?.trim() || null,
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

/** Our own catalogue first (seeded Indian dishes, cached products, custom foods). */
export async function searchLocalFoods(query: string, limit = 25): Promise<Food[]> {
  const q = query.trim();
  let req = supabase.from('foods').select('*').limit(limit);
  req = q ? req.ilike('name', `%${q}%`).order('source', { ascending: false }) : req.eq('source', 'seed').order('name');
  const { data, error } = await req;
  if (error) throw error;
  return (data ?? []) as Food[];
}

/** Packaged foods from Open Food Facts, India first. */
export async function searchOpenFoodFacts(query: string, limit = 20): Promise<FoodCandidate[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url =
    `https://in.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1&action=process` +
    `&page_size=${limit}&fields=${OFF_FIELDS}&search_terms=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: OFF_HEADERS });
    if (!res.ok) return [];
    const body = (await res.json()) as { products?: OffProduct[] };
    return (body.products ?? []).map(fromOff).filter((f): f is FoodCandidate => f !== null);
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
