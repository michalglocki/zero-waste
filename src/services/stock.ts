import { supabase } from '@/lib/supabase';
import type { StockItem, StockItemIdentityFields } from '@/types/stock';

const STOCK_SELECT =
  'id, household_id, barcode, quantity, name, main_category, auxiliary_category, pack_size, created_at, updated_at';

const IDENTITY_KEYS = [
  'name',
  'main_category',
  'auxiliary_category',
  'pack_size',
] as const satisfies readonly (keyof StockItemIdentityFields)[];

/** Lists current household stock, newest-updated first. */
export async function listStockItems(): Promise<StockItem[]> {
  const { data, error } = await supabase
    .from('stock_items')
    .select(STOCK_SELECT)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Looks up a single stock row by exact barcode for the current household.
 * Returns null when no row exists (confirm sheet shows current qty 0).
 */
export async function getStockItemByBarcode(
  barcode: string
): Promise<StockItem | null> {
  const trimmed = barcode.trim();
  if (trimmed === '') {
    return null;
  }

  const { data, error } = await supabase
    .from('stock_items')
    .select(STOCK_SELECT)
    .eq('barcode', trimmed)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Adds `delta` (≥ 1) for `barcode` in the caller's household.
 * Inserts a new row or atomically increments quantity under the unique key
 * via `add_stock_item_by_barcode` (PostgREST upsert cannot express qty + delta).
 */
export async function addStockByBarcode(
  barcode: string,
  delta: number
): Promise<StockItem> {
  const trimmed = barcode.trim();
  if (trimmed === '') {
    throw new Error('barcode required');
  }
  if (!Number.isInteger(delta) || delta < 1) {
    throw new Error('delta must be an integer >= 1');
  }

  const { data, error } = await supabase.rpc('add_stock_item_by_barcode', {
    p_barcode: trimmed,
    p_delta: delta,
  });

  if (error) {
    throw error;
  }

  return data as StockItem;
}

/**
 * Diff-only identity enrich for a household stock row.
 * Updates only identity/pack keys present in `fields` whose value differs from
 * the current row. Never modifies `quantity`. Never nulls out a non-null column
 * solely because the incoming map omitted or cleared that field.
 */
export async function updateStockItemIdentity(
  barcode: string,
  fields: StockItemIdentityFields
): Promise<StockItem> {
  const trimmed = barcode.trim();
  if (trimmed === '') {
    throw new Error('barcode required');
  }

  const current = await getStockItemByBarcode(trimmed);
  if (current === null) {
    throw new Error('stock item not found');
  }

  const patch: StockItemIdentityFields = {};
  for (const key of IDENTITY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) {
      continue;
    }
    const next = fields[key] ?? null;
    const prev = current[key];
    if (next === prev) {
      continue;
    }
    // Do not wipe a filled DB value when OFF omitted / returned empty.
    if (next === null && prev !== null) {
      continue;
    }
    patch[key] = next;
  }

  if (Object.keys(patch).length === 0) {
    return current;
  }

  const { data, error } = await supabase
    .from('stock_items')
    .update(patch)
    .eq('barcode', trimmed)
    .select(STOCK_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as StockItem;
}
