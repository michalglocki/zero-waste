import { supabase } from '@/lib/supabase';
import type { StockItem } from '@/types/stock';

const STOCK_SELECT =
  'id, household_id, barcode, quantity, name, main_category, auxiliary_category, created_at, updated_at';

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
 * Case-insensitive barcode prefix search for the current household.
 * Empty / whitespace-only prefix returns an empty list (no full scan).
 */
export async function searchStockByBarcodePrefix(
  prefix: string
): Promise<StockItem[]> {
  const trimmed = prefix.trim();
  if (trimmed === '') {
    return [];
  }

  const { data, error } = await supabase
    .from('stock_items')
    .select(STOCK_SELECT)
    .ilike('barcode', `${trimmed}%`)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
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
