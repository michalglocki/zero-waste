export type StockItem = {
  id: string;
  household_id: string;
  barcode: string;
  quantity: number;
  name: string | null;
  main_category: string | null;
  auxiliary_category: string | null;
  pack_size: string | null;
  created_at: string;
  updated_at: string;
};

/** Result of `remove_stock_item_by_barcode` — never confuse delete with a null StockItem. */
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
