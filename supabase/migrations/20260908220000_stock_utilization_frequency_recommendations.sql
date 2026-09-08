-- S-05 Phase 1: XOR event identity (barcode | name_key), util/ignore on stock_items,
-- recompute helper + backfill, hook all four add/remove RPCs.
-- List/ignore recommendation RPCs deferred to Phase 2 unless already present.
-- F-01 helpers current_household_id() / is_household_member are left unchanged.

-- ---------------------------------------------------------------------------
-- stock_utilization_events: XOR identity (barcode | name_key)
-- ---------------------------------------------------------------------------

drop index if exists public.stock_utilization_events_household_barcode_removed_at_idx;

alter table public.stock_utilization_events
  drop constraint if exists stock_utilization_events_barcode_nonempty;

alter table public.stock_utilization_events
  alter column barcode drop not null;

alter table public.stock_utilization_events
  add column if not exists name_key text;

alter table public.stock_utilization_events
  drop constraint if exists stock_utilization_events_identity_xor;

alter table public.stock_utilization_events
  add constraint stock_utilization_events_identity_xor
  check (
    (
      barcode is not null
      and char_length(barcode) > 0
      and name_key is null
    )
    or (
      name_key is not null
      and char_length(name_key) > 0
      and barcode is null
    )
  );

create index stock_utilization_events_household_barcode_removed_at_idx
  on public.stock_utilization_events (household_id, barcode, removed_at)
  where barcode is not null;

create index stock_utilization_events_household_name_key_removed_at_idx
  on public.stock_utilization_events (household_id, name_key, removed_at)
  where name_key is not null;

-- ---------------------------------------------------------------------------
-- stock_items: denormalized frequency + ignore
-- ---------------------------------------------------------------------------

alter table public.stock_items
  add column if not exists util_removal_count integer not null default 0;

alter table public.stock_items
  add column if not exists util_last_removed_at timestamptz;

alter table public.stock_items
  add column if not exists util_avg_interval_seconds double precision;

alter table public.stock_items
  add column if not exists recommendation_ignored_at timestamptz;

-- ---------------------------------------------------------------------------
-- Internal recompute helper (security invoker; not a product API)
-- avg = (max(removed_at) - min(removed_at)) / (N - 1) seconds when N >= 2
-- ---------------------------------------------------------------------------

create or replace function public.recompute_stock_item_utilization(
  p_household_id uuid,
  p_barcode text,
  p_name_key text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_barcode text := nullif(trim(p_barcode), '');
  v_name_key text := nullif(trim(p_name_key), '');
  v_count integer := 0;
  v_last timestamptz := null;
  v_avg double precision := null;
begin
  -- Exactly one identity; no-op on degenerate args
  if (v_barcode is null) = (v_name_key is null) then
    return;
  end if;

  if v_barcode is not null then
    select
      count(*)::integer,
      max(e.removed_at),
      case
        when count(*) < 2 then null
        else extract(epoch from (max(e.removed_at) - min(e.removed_at)))
          / (count(*) - 1)::double precision
      end
    into v_count, v_last, v_avg
    from public.stock_utilization_events e
    where e.household_id = p_household_id
      and e.barcode = v_barcode;

    update public.stock_items s
    set
      util_removal_count = coalesce(v_count, 0),
      util_last_removed_at = v_last,
      util_avg_interval_seconds = v_avg
    where s.household_id = p_household_id
      and s.barcode = v_barcode;
  else
    select
      count(*)::integer,
      max(e.removed_at),
      case
        when count(*) < 2 then null
        else extract(epoch from (max(e.removed_at) - min(e.removed_at)))
          / (count(*) - 1)::double precision
      end
    into v_count, v_last, v_avg
    from public.stock_utilization_events e
    where e.household_id = p_household_id
      and e.name_key = v_name_key;

    update public.stock_items s
    set
      util_removal_count = coalesce(v_count, 0),
      util_last_removed_at = v_last,
      util_avg_interval_seconds = v_avg
    where s.household_id = p_household_id
      and s.barcode is null
      and lower(trim(s.name)) = v_name_key;
  end if;
end;
$$;

revoke all on function public.recompute_stock_item_utilization(uuid, text, text) from public;
revoke all on function public.recompute_stock_item_utilization(uuid, text, text) from anon;
-- Invoker RPCs call this as the session user; grant EXECUTE so the call chain works.
-- Not intended as a client product API (recompute is side-effect of add/remove).
grant execute on function public.recompute_stock_item_utilization(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- One-shot backfill from existing events onto live stock rows
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_barcode text;
  v_name_key text;
begin
  for r in
    select id, household_id, barcode, name
    from public.stock_items
  loop
    v_barcode := nullif(trim(r.barcode), '');
    if v_barcode is not null then
      perform public.recompute_stock_item_utilization(r.household_id, v_barcode, null);
    else
      v_name_key := lower(trim(r.name));
      if v_name_key is not null and v_name_key <> '' then
        perform public.recompute_stock_item_utilization(r.household_id, null, v_name_key);
      end if;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared jsonb shape for remove RPC surviving-row payloads
-- ---------------------------------------------------------------------------

create or replace function public.stock_item_to_remove_jsonb(p_row public.stock_items)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'household_id', p_row.household_id,
    'barcode', p_row.barcode,
    'quantity', p_row.quantity,
    'name', p_row.name,
    'main_category', p_row.main_category,
    'auxiliary_category', p_row.auxiliary_category,
    'pack_size', p_row.pack_size,
    'util_removal_count', p_row.util_removal_count,
    'util_last_removed_at', p_row.util_last_removed_at,
    'util_avg_interval_seconds', p_row.util_avg_interval_seconds,
    'recommendation_ignored_at', p_row.recommendation_ignored_at,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$$;

revoke all on function public.stock_item_to_remove_jsonb(public.stock_items) from public;
revoke all on function public.stock_item_to_remove_jsonb(public.stock_items) from anon;
grant execute on function public.stock_item_to_remove_jsonb(public.stock_items) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_stock_item_by_barcode: event → clear ignore + recompute on survive
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
  set
    quantity = quantity - 1,
    recommendation_ignored_at = null
  where id = v_row.id;

  perform public.recompute_stock_item_utilization(v_household_id, v_barcode, null);

  select *
  into v_row
  from public.stock_items
  where id = v_row.id;

  return jsonb_build_object(
    'deleted', false,
    'item', public.stock_item_to_remove_jsonb(v_row)
  );
end;
$$;

revoke all on function public.remove_stock_item_by_barcode(text) from public;
revoke all on function public.remove_stock_item_by_barcode(text) from anon;
grant execute on function public.remove_stock_item_by_barcode(text) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_stock_item_by_id: always event (barcode or name_key)
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
  v_name_key text;
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
  else
    v_name_key := lower(trim(v_row.name));
    if v_name_key is null or v_name_key = '' then
      raise exception 'name required for no-barcode stock item';
    end if;

    insert into public.stock_utilization_events (household_id, name_key, removed_by)
    values (v_household_id, v_name_key, auth.uid());
  end if;

  if v_row.quantity = 1 then
    delete from public.stock_items
    where id = v_row.id;

    return jsonb_build_object('deleted', true);
  end if;

  update public.stock_items
  set
    quantity = quantity - 1,
    recommendation_ignored_at = null
  where id = v_row.id;

  if v_barcode is not null then
    perform public.recompute_stock_item_utilization(v_household_id, v_barcode, null);
  else
    perform public.recompute_stock_item_utilization(v_household_id, null, v_name_key);
  end if;

  select *
  into v_row
  from public.stock_items
  where id = v_row.id;

  return jsonb_build_object(
    'deleted', false,
    'item', public.stock_item_to_remove_jsonb(v_row)
  );
end;
$$;

revoke all on function public.remove_stock_item_by_id(uuid) from public;
revoke all on function public.remove_stock_item_by_id(uuid) from anon;
grant execute on function public.remove_stock_item_by_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- add_stock_item_by_barcode: clear ignore + recompute after write
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

  update public.stock_items
  set recommendation_ignored_at = null
  where id = v_row.id;

  perform public.recompute_stock_item_utilization(v_household_id, v_barcode, null);

  select *
  into v_row
  from public.stock_items
  where id = v_row.id;

  return v_row;
end;
$$;

revoke all on function public.add_stock_item_by_barcode(text, integer) from public;
revoke all on function public.add_stock_item_by_barcode(text, integer) from anon;
grant execute on function public.add_stock_item_by_barcode(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- add_stock_item_manual_no_barcode: clear ignore + recompute after write
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
  v_name_key text;
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

  v_name_key := lower(v_name);

  -- Serialize merge for this household + normalized name
  perform pg_advisory_xact_lock(
    hashtext(v_household_id::text),
    hashtext(v_name_key)
  );

  select *
  into v_row
  from public.stock_items
  where household_id = v_household_id
    and barcode is null
    and lower(trim(name)) = v_name_key
  for update;

  if found then
    update public.stock_items
    set quantity = quantity + p_delta
    where id = v_row.id
    returning * into v_row;
  else
    insert into public.stock_items (household_id, barcode, quantity, name)
    values (v_household_id, null, p_delta, v_name)
    returning * into v_row;
  end if;

  update public.stock_items
  set recommendation_ignored_at = null
  where id = v_row.id;

  perform public.recompute_stock_item_utilization(v_household_id, null, v_name_key);

  select *
  into v_row
  from public.stock_items
  where id = v_row.id;

  return v_row;
end;
$$;

revoke all on function public.add_stock_item_manual_no_barcode(text, integer) from public;
revoke all on function public.add_stock_item_manual_no_barcode(text, integer) from anon;
grant execute on function public.add_stock_item_manual_no_barcode(text, integer) to authenticated;
