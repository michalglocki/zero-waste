-- S-02: nullable pack_size for Open Food Facts quantity text (display-only).
-- Existing UPDATE RLS covers the new column. Qty RPC unchanged.

alter table public.stock_items
  add column pack_size text;
