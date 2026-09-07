-- S-01: stock_items + RLS (SELECT/INSERT/UPDATE) + atomic add-by-barcode RPC
-- Deliberate divergence from F-01 memberships: stock is member-owned CRUD under RLS;
-- memberships remain trigger/RPC-only. No client DELETE in S-01.
-- F-01 helpers current_household_id() / is_household_member are left unchanged.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  barcode text not null,
  quantity integer not null,
  name text,
  main_category text,
  auxiliary_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_items_barcode_nonempty check (char_length(barcode) > 0),
  constraint stock_items_quantity_positive check (quantity >= 1),
  constraint stock_items_household_barcode_unique unique (household_id, barcode)
);

create index stock_items_household_id_idx on public.stock_items (household_id);
create index stock_items_household_updated_at_idx
  on public.stock_items (household_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (any UPDATE, including future S-02 identity fills)
-- ---------------------------------------------------------------------------

create or replace function public.set_stock_items_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_stock_items_updated_at() from public;
revoke all on function public.set_stock_items_updated_at() from anon, authenticated;

drop trigger if exists stock_items_set_updated_at on public.stock_items;
create trigger stock_items_set_updated_at
  before update on public.stock_items
  for each row
  execute function public.set_stock_items_updated_at();

-- ---------------------------------------------------------------------------
-- Atomic add / increment (PostgREST upsert cannot express quantity + delta)
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
  on conflict (household_id, barcode)
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
-- RLS: household-scoped SELECT / INSERT / UPDATE; no DELETE policies or grants
-- ---------------------------------------------------------------------------

alter table public.stock_items enable row level security;

revoke all on table public.stock_items from anon, authenticated;
grant select, insert, update on table public.stock_items to authenticated;

create policy "stock_items_select_member"
  on public.stock_items
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "stock_items_insert_own_household"
  on public.stock_items
  for insert
  to authenticated
  with check (household_id = public.current_household_id());

create policy "stock_items_update_member"
  on public.stock_items
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (household_id = public.current_household_id());
