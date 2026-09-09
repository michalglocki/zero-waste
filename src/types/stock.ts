export type StockItem = {
  id: string;
  household_id: string;
  barcode: string | null;
  quantity: number;
  name: string | null;
  main_category: string | null;
  auxiliary_category: string | null;
  pack_size: string | null;
  util_removal_count: number;
  util_last_removed_at: string | null;
  util_avg_interval_seconds: number | null;
  recommendation_ignored_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Result of remove-by-barcode or remove-by-id RPCs — never confuse delete with a null StockItem. */
export type RemoveStockResult =
  | { deleted: true }
  | { deleted: false; item: StockItem };

/** Optional identity fields for diff-only enrich updates (qty never included). */
export type StockItemIdentityFields = {
  name?: string | null;
  main_category?: string | null;
  auxiliary_category?: string | null;
  pack_size?: string | null;
};
