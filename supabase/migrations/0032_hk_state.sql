-- 0032_hk_state.sql
-- Wspólny, synchronizowany NA ŻYWO stan dnia HK — JEDNO źródło prawdy dla
-- wszystkich urządzeń (recepcja / koordynator / kierownik HK).
--
-- Dokument `data` (jsonb) per (tenant_id, date):
--   {
--     "rooms":  { "218": {"status":"W","person":"Anna","roomType":"2xDBL","br":false,"zs":false}, ... },
--     "roster": [ {"name":"Anna","role":"dyzur","rooms":3,"presence":"obecna"}, ... ]
--   }
--
-- Właściciele kluczy (żeby nikt nie kasował cudzych zmian):
--   • "rooms"  — RECEPCJA (opis pokoju np. „2xDBL", przypisana osoba, status W/WP/PG…)
--   • "roster" — KOORDYNATOR i KIEROWNIK HK (osoby, role/zmiana, obecność)
--
-- Łączenie po stronie bazy jest PŁYTKIM merge (data || patch) w hk_state_merge,
-- więc patch {rooms:…} z recepcji nie rusza klucza "roster", a patch {roster:…}
-- z panelu nie rusza "rooms". `rev` rośnie monotonicznie (last-write-wins na
-- poziomie klucza), a `updated_device` pozwala klientowi zignorować WŁASNE echo
-- realtime (inaczej powstałaby pętla zapis→event→zapis).

create table if not exists public.hk_state (
  tenant_id      uuid        not null default '00000000-0000-0000-0000-000000000001',
  date           date        not null,
  data           jsonb       not null default '{}'::jsonb,
  rev            bigint      not null default 0,
  updated_by     text,                                   -- 'reception' | 'coordinator' | 'hk_manager'
  updated_device text,                                   -- identyfikator urządzenia (anti-echo)
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, date)
);
create index if not exists hk_state_date_idx on public.hk_state(date);

alter table public.hk_state enable row level security;
drop policy if exists "hk_state_read"  on public.hk_state;
drop policy if exists "hk_state_write" on public.hk_state;
-- Telefon (anon) i panele (authenticated) czytają i piszą — jak hk_roster/hk_rooms.
create policy "hk_state_read"  on public.hk_state for select to anon, authenticated using (true);
create policy "hk_state_write" on public.hk_state for all    to anon, authenticated using (true) with check (true);

-- ── Atomowy płytki merge + bump rev. Zwraca nowy wiersz. ─────────────────────
-- Wywołanie: supabase.rpc('hk_state_merge', { p_date, p_patch, p_by, p_device })
create or replace function public.hk_state_merge(
  p_date   date,
  p_patch  jsonb,
  p_by     text  default null,
  p_device text  default null,
  p_tenant uuid  default '00000000-0000-0000-0000-000000000001'
) returns public.hk_state
language plpgsql security definer set search_path = public as $$
declare r public.hk_state;
begin
  insert into public.hk_state(tenant_id, date, data, rev, updated_by, updated_device, updated_at)
  values (p_tenant, p_date, coalesce(p_patch, '{}'::jsonb), 1, p_by, p_device, now())
  on conflict (tenant_id, date) do update
    set data           = public.hk_state.data || coalesce(p_patch, '{}'::jsonb),
        rev            = public.hk_state.rev + 1,
        updated_by     = p_by,
        updated_device = p_device,
        updated_at     = now()
  returning * into r;
  return r;
end $$;

grant execute on function public.hk_state_merge(date, jsonb, text, text, uuid) to anon, authenticated;

-- ── Realtime: każdy zapis natychmiast trafia na pozostałe urządzenia ─────────
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='hk_state'
  ) then
    alter publication supabase_realtime add table public.hk_state;
  end if;
end $$;
