-- 0019_panel_mirror.sql
-- Mirror danych „tylko-localStorage" z aplikacji recepcji do chmury (snapshot jsonb per `kind`),
-- żeby panel mógł je pokazać online: schedule (grafik przydzielony), payment_corrections (korekty),
-- reports_full (raporty zmian = źródło raportu dobowego).
-- Aplikacja recepcji (klucz anon) zapisuje; panel (zalogowany) czyta.

create table if not exists public.panel_mirror (
  tenant_id  uuid not null,
  kind       text not null,                 -- schedule | payment_corrections | reports_full
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, kind)
);

alter table public.panel_mirror enable row level security;

drop policy if exists "panel_mirror_anon_write" on public.panel_mirror;
create policy "panel_mirror_anon_write" on public.panel_mirror
  for all to anon using (true) with check (true);

drop policy if exists "panel_mirror_auth_read" on public.panel_mirror;
create policy "panel_mirror_auth_read" on public.panel_mirror
  for select to authenticated using (true);
