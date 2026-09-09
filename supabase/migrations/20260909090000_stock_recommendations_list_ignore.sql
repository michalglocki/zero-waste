-- S-05 Phase 2: list likely-empty recommendations + ignore write (DB now() only).
-- Eligibility is evaluated server-side; clients must not use device Date for overdue.

-- ---------------------------------------------------------------------------
-- list_likely_empty_recommendations: qty=1, history≥2, overdue, not ignored
-- ---------------------------------------------------------------------------

create or replace function public.list_likely_empty_recommendations()
returns setof public.stock_items
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_household_id uuid := public.current_household_id();
begin
  if v_household_id is null then
    raise exception 'not a household member';
  end if;

  return query
  select s.*
  from public.stock_items s
  where s.household_id = v_household_id
    and s.quantity = 1
    and s.util_removal_count >= 2
    and s.util_avg_interval_seconds is not null
    and s.recommendation_ignored_at is null
    and s.util_last_removed_at is not null
    and (now() - s.util_last_removed_at)
      >= (s.util_avg_interval_seconds * interval '1 second')
  order by s.updated_at desc;
end;
$$;

revoke all on function public.list_likely_empty_recommendations() from public;
revoke all on function public.list_likely_empty_recommendations() from anon;
grant execute on function public.list_likely_empty_recommendations() to authenticated;

-- ---------------------------------------------------------------------------
-- ignore_stock_recommendation: set ignore timestamp for current-household row
-- ---------------------------------------------------------------------------

create or replace function public.ignore_stock_recommendation(p_id uuid)
returns public.stock_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid := public.current_household_id();
  v_row public.stock_items;
begin
  if v_household_id is null then
    raise exception 'not a household member';
  end if;

  if p_id is null then
    raise exception 'id required';
  end if;

  update public.stock_items
  set recommendation_ignored_at = now()
  where id = p_id
    and household_id = v_household_id
  returning * into v_row;

  if not found then
    raise exception 'stock item not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.ignore_stock_recommendation(uuid) from public;
revoke all on function public.ignore_stock_recommendation(uuid) from anon;
grant execute on function public.ignore_stock_recommendation(uuid) to authenticated;
