-- 0055_own_rates.sql  (ETAP 4 — asystent cen bez konkurencji)
-- WYKONANIE 4.20. Propozycje cen per dzień/typ pokoju: cena bazowa + sugestia silnika
-- (src/lib/pricing.js) z uzasadnieniem, zatwierdzana ręcznie przez kierownika
-- (status proposed→approved/rejected). Silnik NIE zmienia cen sam. Idempotentne.

create table if not exists public.own_rates (
  tenant_id        uuid    not null,
  stay_date        date    not null,
  room_type        text    not null,
  base_price       numeric,                          -- cena bazowa (wejście silnika)
  suggested_price  numeric,                          -- wynik silnika
  suggested_reason jsonb   not null default '{}',    -- czynniki/uzasadnienie (factors + reason)
  approved_price   numeric,                          -- co zatwierdził/edytował kierownik
  status           text    not null default 'proposed'
                     check (status in ('proposed','approved','rejected')),
  updated_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (tenant_id, stay_date, room_type)
);
create index if not exists own_rates_tenant_date_idx on public.own_rates(tenant_id, stay_date);

alter table public.own_rates enable row level security;
drop policy if exists "own_rates_read"       on public.own_rates;
drop policy if exists "own_rates_auth_write" on public.own_rates;
drop policy if exists "own_rates_auth_upd"   on public.own_rates;
create policy "own_rates_read"       on public.own_rates for select using (true);
create policy "own_rates_auth_write" on public.own_rates for insert to authenticated
  with check ( public.current_app_role() is not null );
create policy "own_rates_auth_upd"   on public.own_rates for update to authenticated
  using ( public.current_app_role() is not null ) with check ( public.current_app_role() is not null );
