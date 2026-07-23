-- 0051_tenant_settings.sql  (ETAP 2 — ustawienia per hotel)
-- WYKONANIE 2.19. Uniwersalny magazyn ustawień tenanta: klucz → wartość jsonb.
-- Zasila SETTINGS_REGISTRY + generyczny formularz w UstawieniaPanel — dodanie
-- nowego przełącznika = wiersz w rejestrze, bez nowego JSX ani migracji.
-- Kolumna rev pod przyszły merge+rev (2.10). Idempotentne.

create table if not exists public.tenant_settings (
  tenant_id  uuid not null,
  key        text not null,
  value      jsonb,
  rev        bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);
alter table public.tenant_settings enable row level security;

-- Odczyt: aplikacja (anon) i panel (authenticated). Zapis: zalogowany z rolą
-- (docelowo zawężone przez 2.15). Bez wierszy → aplikacja bierze default z rejestru.
drop policy if exists "tenant_settings_read"       on public.tenant_settings;
drop policy if exists "tenant_settings_auth_write" on public.tenant_settings;
drop policy if exists "tenant_settings_auth_upd"   on public.tenant_settings;
create policy "tenant_settings_read"       on public.tenant_settings for select using (true);
create policy "tenant_settings_auth_write" on public.tenant_settings for insert to authenticated
  with check ( public.current_app_role() is not null );
create policy "tenant_settings_auth_upd"   on public.tenant_settings for update to authenticated
  using ( public.current_app_role() is not null ) with check ( public.current_app_role() is not null );
