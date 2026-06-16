-- 0009_hk_roster.sql
-- Obsada HK ustalana przez menadżera na telefonie (wyjazdy.html, przycisk „Wyślij")
-- → recepcja wczytuje ją w panelu HK i klika Auto-przypisz (Opcja B).
-- Lekka, dedykowana tabela — NIE rusza hk_plan ani jego ograniczeń.

create table if not exists public.hk_roster (
  tenant_id  uuid not null,
  date       date not null,
  roster     jsonb not null default '[]',   -- [{name, role: 'poranna'|'dyzur'|'popoludnie'}]
  updated_at timestamptz not null default now(),
  primary key (tenant_id, date)
);

alter table public.hk_roster enable row level security;

drop policy if exists "hk_roster_anon_read"   on public.hk_roster;
drop policy if exists "hk_roster_anon_insert" on public.hk_roster;
drop policy if exists "hk_roster_anon_update" on public.hk_roster;
create policy "hk_roster_anon_read"   on public.hk_roster for select to anon using (true);
create policy "hk_roster_anon_insert" on public.hk_roster for insert to anon with check (true);
create policy "hk_roster_anon_update" on public.hk_roster for update to anon using (true) with check (true);
