import { supabase } from '@/lib/supabase';
import type {
  RemoveStockResult,
  StockItem,
  StockItemIdentityFields,
} from '@/types/stock';

const STOCK_SELECT =
  'id, household_id, barcode, quantity, name, main_category, auxiliary_category, pack_size, util_removal_count, util_last_removed_at, util_avg_interval_seconds, recommendation_ignored_at, created_at, updated_at';

/** Stable message for missing-row remove — UI maps this to "Not in stock". */
export const STOCK_NOT_IN_STOCK_MESSAGE = 'stock item not found';

const IDENTITY_KEYS = [
  'name',
  'main_category',
  'auxiliary_category',
  'pack_size',
] as const satisfies readonly (keyof StockItemIdentityFields)[];

function isStockNotInStockRpcError(error: { message?: string }): boolean {
  const message = error.message ?? '';
  return message === STOCK_NOT_IN_STOCK_MESSAGE || message.includes(STOCK_NOT_IN_STOCK_MESSAGE);
}

function mapRemoveRpcPayload(data: unknown): RemoveStockResult {
  if (data == null || typeof data !== 'object') {
    throw new Error('unexpected remove result');
  }

  const payload = data as { deleted?: unknown; item?: unknown };

  if (payload.deleted === true) {
    return { deleted: true };
  }

  if (payload.deleted === false && payload.item != null && typeof payload.item === 'object') {
    return { deleted: false, item: payload.item as StockItem };
  }

  throw new Error('unexpected remove result');
}

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
 * Adds `delta` (≥ 1) for a no-code row: barcode null, merge by lower(trim(name)).
 * Via `add_stock_item_manual_no_barcode` (atomic find-or-insert under household lock).
 */
export async function addStockManualNoBarcode(
  name: string,
  delta: number
): Promise<StockItem> {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new Error('name required');
  }
  if (!Number.isInteger(delta) || delta < 1) {
    throw new Error('delta must be an integer >= 1');
  }

  const { data, error } = await supabase.rpc('add_stock_item_manual_no_barcode', {
    p_name: trimmed,
    p_delta: delta,
  });

  if (error) {
    throw error;
  }

  return data as StockItem;
}

/**
 * Decrements quantity by 1 for `barcode` in the caller's household via
 * `remove_stock_item_by_barcode`. Records a utilization event server-side.
 * When quantity would hit 0, the row is deleted (`{ deleted: true }`).
 * Missing row → throws with {@link STOCK_NOT_IN_STOCK_MESSAGE} (no event written).
 */
export async function removeStockByBarcode(
  barcode: string
): Promise<RemoveStockResult> {
  const trimmed = barcode.trim();
  if (trimmed === '') {
    throw new Error('barcode required');
  }

  const { data, error } = await supabase.rpc('remove_stock_item_by_barcode', {
    p_barcode: trimmed,
  });

  if (error) {
    if (isStockNotInStockRpcError(error)) {
      throw new Error(STOCK_NOT_IN_STOCK_MESSAGE);
    }
    throw error;
  }

  return mapRemoveRpcPayload(data);
}

/**
 * Decrements quantity by 1 for `id` in the caller's household via
 * `remove_stock_item_by_id`. Always records a utilization event (barcode or
 * name_key). Missing row → {@link STOCK_NOT_IN_STOCK_MESSAGE}.
 */
export async function removeStockById(id: string): Promise<RemoveStockResult> {
  const trimmed = id.trim();
  if (trimmed === '') {
    throw new Error('id required');
  }

  const { data, error } = await supabase.rpc('remove_stock_item_by_id', {
    p_id: trimmed,
  });

  if (error) {
    if (isStockNotInStockRpcError(error)) {
      throw new Error(STOCK_NOT_IN_STOCK_MESSAGE);
    }
    throw error;
  }

  return mapRemoveRpcPayload(data);
}

/**
 * Lists qty-1 products overdue vs their average removal interval for the
 * caller's household. Overdue is evaluated with server `now()` inside
 * `list_likely_empty_recommendations` — do not re-filter with device time.
 */
export async function listLikelyEmptyRecommendations(): Promise<StockItem[]> {
  const { data, error } = await supabase.rpc('list_likely_empty_recommendations');

  if (error) {
    throw error;
  }

  return (data ?? []) as StockItem[];
}

/**
 * Sets `recommendation_ignored_at` for a current-household stock row via
 * `ignore_stock_recommendation`. Clears only on a later add/remove RPC.
 * Missing / wrong-household row → {@link STOCK_NOT_IN_STOCK_MESSAGE}.
 */
export async function ignoreRecommendation(itemId: string): Promise<StockItem> {
  const trimmed = itemId.trim();
  if (trimmed === '') {
    throw new Error('id required');
  }

  const { data, error } = await supabase.rpc('ignore_stock_recommendation', {
    p_id: trimmed,
  });

  if (error) {
    if (isStockNotInStockRpcError(error)) {
      throw new Error(STOCK_NOT_IN_STOCK_MESSAGE);
    }
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
