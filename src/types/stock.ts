export type StockItem = {
  id: string;
  household_id: string;
  barcode: string;
  quantity: number;
  name: string | null;
  main_category: string | null;
  auxiliary_category: string | null;
  created_at: string;
  updated_at: string;
};
