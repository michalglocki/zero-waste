-- F2 impl-review: exclude non-positive average intervals from recommendations.
-- Avg 0 (identical removed_at) or negative (forged UPDATE) must not always match overdue.

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
    and s.util_avg_interval_seconds > 0
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
