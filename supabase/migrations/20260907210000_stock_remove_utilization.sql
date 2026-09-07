-- S-03: stock_utilization_events + DELETE on stock_items + atomic remove RPC
-- Mirrors S-01 add path: security invoker + RLS grants (not F-01 definer helpers).
-- Events are keyed by (household_id, barcode) — no FK to stock_items.

-- ---------------------------------------------------------------------------
-- Utilization events (append-only; survives stock row delete / re-add)
-- ---------------------------------------------------------------------------

create table public.stock_utilization_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  barcode text not null,
  removed_at timestamptz not null default now(),
  removed_by uuid references auth.users (id) on delete set null,
  constraint stock_utilization_events_barcode_nonempty check (char_length(barcode) > 0)
);

create index stock_utilization_events_household_barcode_removed_at_idx
  on public.stock_utilization_events (household_id, barcode, removed_at);

alter table public.stock_utilization_events enable row level security;

revoke all on table public.stock_utilization_events from anon, authenticated;
grant select, insert on table public.stock_utilization_events to authenticated;

create policy "stock_utilization_events_select_member"
  on public.stock_utilization_events
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "stock_utilization_events_insert_own_household"
  on public.stock_utilization_events
  for insert
  to authenticated
  with check (household_id = public.current_household_id());

-- ---------------------------------------------------------------------------
-- stock_items: allow hard-delete at qty 0 (deferred from S-01)
-- ---------------------------------------------------------------------------

grant delete on table public.stock_items to authenticated;

create policy "stock_items_delete_member"
  on public.stock_items
  for delete
  to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Atomic remove / decrement (returns jsonb: { deleted } | { deleted, item })
-- ---------------------------------------------------------------------------

create or replace function public.remove_stock_item_by_barcode(p_barcode text)
returns jsonb
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

  select *
  into v_row
  from public.stock_items
  where household_id = v_household_id
    and barcode = v_barcode
  for update;

  if not found then
    raise exception 'stock item not found';
  end if;

  insert into public.stock_utilization_events (household_id, barcode, removed_by)
  values (v_household_id, v_barcode, auth.uid());

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

revoke all on function public.remove_stock_item_by_barcode(text) from public;
revoke all on function public.remove_stock_item_by_barcode(text) from anon;
grant execute on function public.remove_stock_item_by_barcode(text) to authenticated;
