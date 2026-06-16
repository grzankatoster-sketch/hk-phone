-- 0025_panel_hk.sql
-- Przypomnienia kierownika HK widoczne na telefonach ekipy (drugie okno „Poproś o pokój").
-- Telefon (anon) czyta; panel (zalogowany kierownik HK) dodaje/usuwa.

create table if not exists public.hk_reminders (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  body       text not null,
  created_by text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists hk_reminders_active_idx on public.hk_reminders(tenant_id, active, created_at desc);

alter table public.hk_reminders enable row level security;

drop policy if exists "hk_reminders_anon_read" on public.hk_reminders;
create policy "hk_reminders_anon_read" on public.hk_reminders for select to anon using (true);

drop policy if exists "hk_reminders_auth_all" on public.hk_reminders;
create policy "hk_reminders_auth_all" on public.hk_reminders
  for all to authenticated using (public.current_app_role() is not null) with check (public.current_app_role() is not null);
