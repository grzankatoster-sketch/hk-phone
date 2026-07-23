-- 0049_tenants.sql  (ETAP 2 SaaS — rejestr tenantów + katalog funkcji per tenant)
-- WYKONANIE 2.1. Fundament fabryki wersji: kto jest klientem (tenants) i które
-- moduły ma opłacone (tenant_features). Warunek konieczny dla 2.2 (egzekwowanie
-- server-side), 2.7 (fabryka), 3.2 (slug→tenant), 5.1 (tiery).
-- Idempotentne. Uruchomić: supabase db push.

-- ─── tenants ──────────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null,
  status        text not null default 'trial'
                  check (status in ('trial','active','suspended')),
  plan          text not null default 'start',
  created_at    timestamptz not null default now(),
  trial_ends_at timestamptz,
  unique (slug)
);
alter table public.tenants enable row level security;
-- Odczyt: aplikacja (anon) i panel (authenticated) — potrzebne do rozwiązania
-- slug→tenant_id (3.2) i brandingu w runtime (2.7). Zmiana rejestru: tylko
-- zalogowany z rolą (docelowo zawężone do właściciela/serwisu — 2.15).
drop policy if exists "tenants_read"       on public.tenants;
drop policy if exists "tenants_auth_write" on public.tenants;
drop policy if exists "tenants_auth_upd"   on public.tenants;
create policy "tenants_read"       on public.tenants for select using (true);
create policy "tenants_auth_write" on public.tenants for insert to authenticated
  with check ( public.current_app_role() is not null );
create policy "tenants_auth_upd"   on public.tenants for update to authenticated
  using ( public.current_app_role() is not null ) with check ( public.current_app_role() is not null );

-- ─── tenant_features ──────────────────────────────────────────────────────────
-- Które moduły są włączone per tenant. Brak wiersza = moduł wyłączony (deny-by-default,
-- zgodnie z 2.3), chyba że moduł jest core w MODULE_REGISTRY (rdzeń zawsze dostępny).
create table if not exists public.tenant_features (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  feature_key text not null,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, feature_key)
);
alter table public.tenant_features enable row level security;
drop policy if exists "tenant_features_read"       on public.tenant_features;
drop policy if exists "tenant_features_auth_write" on public.tenant_features;
drop policy if exists "tenant_features_auth_upd"   on public.tenant_features;
create policy "tenant_features_read"       on public.tenant_features for select using (true);
create policy "tenant_features_auth_write" on public.tenant_features for insert to authenticated
  with check ( public.current_app_role() is not null );
create policy "tenant_features_auth_upd"   on public.tenant_features for update to authenticated
  using ( public.current_app_role() is not null ) with check ( public.current_app_role() is not null );

-- ─── Seed: obecny tenant (Conrad Comfort) + tenant demo (do dowodu fabryki 5.4) ──
insert into public.tenants (id, name, slug, status, plan) values
  ('00000000-0000-0000-0000-000000000001','Conrad Comfort','conrad-comfort','active','pro')
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, plan, trial_ends_at) values
  ('00000000-0000-0000-0000-000000000002','Hotel Demo','demo-hotel','trial','start', now() + interval '14 days')
on conflict (id) do nothing;

-- Conrad: licencjonowalne moduły włączone (zachowanie jak dziś — wszystko dostępne).
insert into public.tenant_features (tenant_id, feature_key, enabled)
select '00000000-0000-0000-0000-000000000001', k, true
from unnest(array['hk','parking','goscie','vouchery','opinie','zadania']) as k
on conflict (tenant_id, feature_key) do nothing;

-- Demo (tier START): tylko wybrane moduły — reszta wyłączona przez deny-by-default.
insert into public.tenant_features (tenant_id, feature_key, enabled)
select '00000000-0000-0000-0000-000000000002', k, true
from unnest(array['opinie']) as k
on conflict (tenant_id, feature_key) do nothing;
