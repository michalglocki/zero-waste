-- S-04: nullable barcode + partial unique; manual no-code add/merge; remove-by-id
-- Leaves remove_stock_item_by_barcode in place. Utilization events still require nonempty barcode.
-- F-01 helpers current_household_id() / is_household_member are left unchanged.

-- ---------------------------------------------------------------------------
-- Allow null barcodes; one row per nonempty barcode per household
-- ---------------------------------------------------------------------------

alter table public.stock_items
  drop constraint stock_items_barcode_nonempty;

alter table public.stock_items
  drop constraint stock_items_household_barcode_unique;

alter table public.stock_items
  alter column barcode drop not null;

alter table public.stock_items
  add constraint stock_items_barcode_null_or_nonempty
  check (barcode is null or char_length(barcode) > 0);

create unique index stock_items_household_barcode_unique
  on public.stock_items (household_id, barcode)
  where barcode is not null;

-- ---------------------------------------------------------------------------
-- Rewrite barcode add: conflict arbiter must match the partial unique index
-- ---------------------------------------------------------------------------

create or replace function public.add_stock_item_by_barcode(
  p_barcode text,
  p_delta integer
)
returns public.stock_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid := public.current_household_id();
  v_barcode text := trim(p_barcode);
  v_row public.stock_items;
begin
  if v_household_id is null then
    raise exception 'not a household member';
  end if;

  if v_barcode is null or v_barcode = '' then
    raise exception 'barcode required';
  end if;

  if p_delta is null or p_delta < 1 then
    raise exception 'delta must be >= 1';
  end if;

  insert into public.stock_items (household_id, barcode, quantity)
  values (v_household_id, v_barcode, p_delta)
  on conflict (household_id, barcode) where barcode is not null
  do update set
    quantity = public.stock_items.quantity + excluded.quantity
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.add_stock_item_by_barcode(text, integer) from public;
revoke all on function public.add_stock_item_by_barcode(text, integer) from anon;
grant execute on function public.add_stock_item_by_barcode(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic add / merge for no-code rows (barcode NULL), by lower(trim(name))
-- ---------------------------------------------------------------------------

create or replace function public.add_stock_item_manual_no_barcode(
  p_name text,
  p_delta integer
)
returns public.stock_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid := public.current_household_id();
  v_name text := trim(p_name);
  v_row public.stock_items;
begin
  if v_household_id is null then
    raise exception 'not a household member';
  end if;

  if v_name is null or v_name = '' then
    raise exception 'name required';
  end if;

  if p_delta is null or p_delta < 1 then
    raise exception 'delta must be >= 1';
  end if;

  -- Serialize merge for this household + normalized name (no unique index yet)
  perform pg_advisory_xact_lock(
    hashtext(v_household_id::text),
    hashtext(lower(v_name))
  );

  select *
  into v_row
  from public.stock_items
  where household_id = v_household_id
    and barcode is null
    and lower(trim(name)) = lower(v_name)
  for update;

  if found then
    update public.stock_items
    set quantity = quantity + p_delta
    where id = v_row.id
    returning * into v_row;

    return v_row;
  end if;

  insert into public.stock_items (household_id, barcode, quantity, name)
  values (v_household_id, null, p_delta, v_name)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.add_stock_item_manual_no_barcode(text, integer) from public;
revoke all on function public.add_stock_item_manual_no_barcode(text, integer) from anon;
grant execute on function public.add_stock_item_manual_no_barcode(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic remove / decrement by id (utilization event only when barcode present)
-- ---------------------------------------------------------------------------

create or replace function public.remove_stock_item_by_id(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid := public.current_household_id();
  v_barcode text;
  v_row public.stock_items;
begin
  if v_household_id is null then
    raise exception 'not a household member';
  end if;

  if p_id is null then
    raise exception 'stock item not found';
  end if;

  select *
  into v_row
  from public.stock_items
  where id = p_id
    and household_id = v_household_id
  for update;

  if not found then
    raise exception 'stock item not found';
  end if;

  v_barcode := nullif(trim(v_row.barcode), '');

  if v_barcode is not null then
    insert into public.stock_utilization_events (household_id, barcode, removed_by)
    values (v_household_id, v_barcode, auth.uid());
  end if;

  if v_row.quantity = 1 then
    delete from public.stock_items
    where id = v_row.id;

    return jsonb_build_object('deleted', true);
  end if;

  update public.stock_items
  set quantity = quantity - 1
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'deleted', false,
    'item', jsonb_build_object(
      'id', v_row.id,
      'household_id', v_row.household_id,
      'barcode', v_row.barcode,
      'quantity', v_row.quantity,
      'name', v_row.name,
      'main_category', v_row.main_category,
      'auxiliary_category', v_row.auxiliary_category,
      'pack_size', v_row.pack_size,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at
    )
  );
end;
$$;

revoke all on function public.remove_stock_item_by_id(uuid) from public;
revoke all on function public.remove_stock_item_by_id(uuid) from anon;
grant execute on function public.remove_stock_item_by_id(uuid) to authenticated;
