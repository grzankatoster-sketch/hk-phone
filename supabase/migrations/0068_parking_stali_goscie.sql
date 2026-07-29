-- 0066_parking_stali_goscie.sql
-- Wyprowadzenie PII (WYKONANIE 0.3) z zaszytych seedow JS w ParkingPanel.jsx i
-- StaliGosciePanel.jsx do bazy per tenant. Dane admin-only, edytowane rzadko —
-- bez RPC/realtime jak shop_*, komponenty pobieraja je raz przy pustym
-- localStorage (patrz scripts/backfill-parking-stali-goscie.cjs).

create table if not exists public.parking_records (
  id         text primary key,
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  plate      text,
  name       text,
  phone      text,
  type       text not null default 'abonament',
  status     text,
  paid_to    text,
  paid_on    text,
  doc_nr     text,
  note       text,
  price      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists parking_records_tenant_idx on public.parking_records(tenant_id, active);

alter table public.parking_records enable row level security;
drop policy if exists "parking_records_anon" on public.parking_records;
drop policy if exists "parking_records_auth" on public.parking_records;
create policy "parking_records_anon" on public.parking_records for all to anon using (true) with check (true);
create policy "parking_records_auth" on public.parking_records for all to authenticated using (true) with check (true);

create table if not exists public.stali_goscie (
  id               text primary key,
  tenant_id        uuid not null default '00000000-0000-0000-0000-000000000001',
  name             text not null,
  room             text,
  company          text,
  notes            text,
  price_season     text,
  price_off_season text,
  meal             text,
  category         text not null default 'private',
  has_fv           boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists stali_goscie_tenant_idx on public.stali_goscie(tenant_id, category);

alter table public.stali_goscie enable row level security;
drop policy if exists "stali_goscie_anon" on public.stali_goscie;
drop policy if exists "stali_goscie_auth" on public.stali_goscie;
create policy "stali_goscie_anon" on public.stali_goscie for all to anon using (true) with check (true);
create policy "stali_goscie_auth" on public.stali_goscie for all to authenticated using (true) with check (true);
