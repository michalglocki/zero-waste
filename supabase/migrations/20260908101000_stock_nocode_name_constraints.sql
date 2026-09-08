-- Impl-review F1/F2: enforce no-code name required + unique merge key at DB boundary
-- Additive; fails if existing null-barcode rows violate name or duplicate lower(trim(name)).

-- F1: name required when barcode is null
alter table public.stock_items
  add constraint stock_items_no_barcode_requires_name
  check (
    barcode is not null
    or (name is not null and char_length(trim(name)) > 0)
  );

-- F2: one no-code row per normalized name per household
create unique index stock_items_household_nocode_name_unique
  on public.stock_items (household_id, (lower(trim(name))))
  where barcode is null;
