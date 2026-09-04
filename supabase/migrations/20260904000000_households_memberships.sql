-- F-01: households + memberships + RLS helpers + signup trigger + join RPC
-- Client writes are denied; membership is created by trigger and moved by RPC only.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null,
  created_at timestamptz not null default now(),
  constraint households_invite_code_unique unique (invite_code)
);

create table public.memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index memberships_household_id_idx on public.memberships (household_id);

-- ---------------------------------------------------------------------------
-- Invite code helper (non-sequential, ambiguous-char-safe alphabet)
-- ---------------------------------------------------------------------------

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(
      alphabet,
      1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)),
      1
    );
  end loop;
  return result;
end;
$$;

revoke all on function public.generate_invite_code() from public;
revoke all on function public.generate_invite_code() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER + pinned search_path — avoid policy recursion)
-- ---------------------------------------------------------------------------

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.household_id
  from public.memberships m
  where m.user_id = (select auth.uid())
$$;

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.household_id = p_household_id
  )
$$;

grant execute on function public.current_household_id() to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Signup trigger: auto-create household + membership for every new auth user
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_household_id uuid;
  code text;
  attempts int := 0;
begin
  loop
    code := public.generate_invite_code();
    begin
      insert into public.households (invite_code)
      values (code)
      returning id into new_household_id;
      exit;
    exception
      when unique_violation then
        attempts := attempts + 1;
        if attempts >= 10 then
          raise exception 'could not allocate unique invite_code';
        end if;
    end;
  end loop;

  insert into public.memberships (user_id, household_id)
  values (new.id, new_household_id);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Join RPC: move membership to invite target; delete empty prior household
-- ---------------------------------------------------------------------------

create or replace function public.join_household_by_invite_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_target_id uuid;
  v_prior_id uuid;
  v_normalized text := upper(trim(p_code));
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if v_normalized is null or v_normalized = '' then
    raise exception 'invalid invite code';
  end if;

  select h.id
  into v_target_id
  from public.households h
  where upper(h.invite_code) = v_normalized;

  if v_target_id is null then
    raise exception 'invalid invite code';
  end if;

  select m.household_id
  into v_prior_id
  from public.memberships m
  where m.user_id = v_uid;

  if v_prior_id is not null and v_prior_id = v_target_id then
    return v_target_id;
  end if;

  if v_prior_id is null then
    insert into public.memberships (user_id, household_id)
    values (v_uid, v_target_id);
  else
    update public.memberships
    set household_id = v_target_id
    where user_id = v_uid;

    delete from public.households h
    where h.id = v_prior_id
      and not exists (
        select 1
        from public.memberships m
        where m.household_id = h.id
      );
  end if;

  return v_target_id;
end;
$$;

revoke all on function public.join_household_by_invite_code(text) from public;
revoke all on function public.join_household_by_invite_code(text) from anon;
grant execute on function public.join_household_by_invite_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: SELECT for own household / co-members; no client writes
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.memberships enable row level security;

revoke all on table public.households from anon, authenticated;
revoke all on table public.memberships from anon, authenticated;

grant select on table public.households to authenticated;
grant select on table public.memberships to authenticated;

create policy "households_select_member"
  on public.households
  for select
  to authenticated
  using (public.is_household_member(id));

create policy "memberships_select_own_or_co_member"
  on public.memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_household_member(household_id)
  );

-- No INSERT / UPDATE / DELETE policies on either table for clients.
-- Writes happen only via handle_new_user trigger and join_household_by_invite_code.
