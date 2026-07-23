-- 0061_meal_plan.sql
-- Śniadania/HB na tablet restauracji (WYKONANIE 4.15, rozszerzone o wymaganie
-- usera 23.07.2026). Dane wejściowe: eksport KWHotel "Posiłki i usługi w
-- rezerwacji" (CSV, UTF-16) importowany RĘCZNIE na razie skryptem
-- scripts/import-kwhotel-meals.mjs — mail automation jeszcze nie podpięta
-- (user: "nie przychodzi ale zrobię to, na razie zacznijmy od podstaw").
--
-- Model PER POKÓJ (nie per gość) — user: "sa per pokoj i osoba ale zrobmy
-- per pokoj bo zawsze podaja numer pokoju". Kategoria: BB (tylko śniadanie)
-- lub HB (śniadanie + kolacja) — user: "jak jest HB to ma sniadanie i kolacje".

create table if not exists public.meal_plans (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default '00000000-0000-0000-0000-000000000001',
  reservation_id text not null,
  room           text not null,
  guest_name     text,
  arrival        date not null,
  departure      date not null,
  category       text not null,             -- BB | HB
  persons        integer not null default 1,
  source         text not null default 'csv_import',
  imported_at    timestamptz not null default now(),
  unique (tenant_id, reservation_id, room)
);
create index if not exists meal_plans_room_idx on public.meal_plans(tenant_id, room, arrival, departure);

-- Stan odhaczenia per dzień/pokój/posiłek. checked_persons = ABSOLUTNA liczba
-- osób odhaczonych (nie increment) — idempotentne przy podwójnym kliknięciu.
-- extra_persons = dokupione dodatkowo (gość bez BB/HB kupuje jednorazowo).
create table if not exists public.meal_checkins (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default '00000000-0000-0000-0000-000000000001',
  date            date not null,
  room            text not null,
  meal            text not null,             -- breakfast | dinner
  checked_persons integer not null default 0,
  extra_persons   integer not null default 0,
  checked_by      text,
  checked_at      timestamptz,
  updated_at      timestamptz not null default now(),
  unique (tenant_id, date, room, meal)
);
create index if not exists meal_checkins_date_idx on public.meal_checkins(tenant_id, date);

alter table public.meal_plans enable row level security;
drop policy if exists "meal_plans_anon" on public.meal_plans;
drop policy if exists "meal_plans_auth" on public.meal_plans;
create policy "meal_plans_anon" on public.meal_plans for all to anon using (true) with check (true);
create policy "meal_plans_auth" on public.meal_plans for all to authenticated using (true) with check (true);

alter table public.meal_checkins enable row level security;
drop policy if exists "meal_checkins_anon" on public.meal_checkins;
drop policy if exists "meal_checkins_auth" on public.meal_checkins;
create policy "meal_checkins_anon" on public.meal_checkins for all to anon using (true) with check (true);
create policy "meal_checkins_auth" on public.meal_checkins for all to authenticated using (true) with check (true);

-- Ustawienie stanu odhaczenia — SET, nie increment (bezpieczne przy podwójnym kliknięciu z tabletu).
drop function if exists public.meal_checkin_set(date, text, text, integer, integer, text);
create or replace function public.meal_checkin_set(
  p_date            date,
  p_room            text,
  p_meal            text,
  p_checked_persons integer,
  p_extra_persons   integer default 0,
  p_by              text default null
) returns public.meal_checkins
language plpgsql security definer set search_path = public as $$
declare r public.meal_checkins;
begin
  insert into public.meal_checkins(tenant_id, date, room, meal, checked_persons, extra_persons, checked_by, checked_at, updated_at)
  values ('00000000-0000-0000-0000-000000000001', p_date, p_room, p_meal,
          greatest(0, coalesce(p_checked_persons,0)), greatest(0, coalesce(p_extra_persons,0)), p_by, now(), now())
  on conflict (tenant_id, date, room, meal) do update
    set checked_persons = greatest(0, coalesce(p_checked_persons,0)),
        extra_persons   = greatest(0, coalesce(p_extra_persons,0)),
        checked_by      = p_by,
        checked_at      = now(),
        updated_at      = now()
  returning * into r;
  return r;
end $$;
grant execute on function public.meal_checkin_set(date, text, text, integer, integer, text) to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='meal_plans') then
    alter publication supabase_realtime add table public.meal_plans;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='meal_checkins') then
    alter publication supabase_realtime add table public.meal_checkins;
  end if;
end $$;
