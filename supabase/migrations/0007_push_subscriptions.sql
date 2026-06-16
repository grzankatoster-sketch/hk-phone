-- 0007_push_subscriptions.sql
-- Subskrypcje Web Push (PWA telefonów HK / konserwacji). Telefon zapisuje swoją
-- subskrypcję; wysyłką zajmuje się Edge Function `push-send` (service_role).

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  role       text not null default 'hk',     -- 'hk' (pracownicy) | 'konserwacja'
  worker     text,                            -- kto (z ?w= / ?k=), opcjonalnie
  endpoint   text not null unique,            -- unikalny adres push danego urządzenia
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Uzupełnij kolumny, gdyby tabela istniała w niepełnej wersji z wcześniejszej próby
-- (inaczej indeks/insert na brakującej kolumnie rzuca "column ... does not exist").
alter table public.push_subscriptions add column if not exists tenant_id  uuid;
alter table public.push_subscriptions add column if not exists role       text not null default 'hk';
alter table public.push_subscriptions add column if not exists worker     text;
alter table public.push_subscriptions add column if not exists endpoint   text;
alter table public.push_subscriptions add column if not exists p256dh     text;
alter table public.push_subscriptions add column if not exists auth       text;
alter table public.push_subscriptions add column if not exists created_at timestamptz not null default now();

-- Usuń martwe kolumny z wcześniejszej wersji schematu, które blokowały insert
-- ("null value in column ... violates not-null constraint"). Aplikacja zapisuje
-- imię do `worker`, a klucze do osobnych `p256dh` / `auth` — stara `keys` (jsonb)
-- i `employee` są nieużywane.
alter table public.push_subscriptions drop column if exists employee;
alter table public.push_subscriptions drop column if exists keys;

create unique index if not exists push_sub_endpoint_uniq
  on public.push_subscriptions (endpoint);

create index if not exists push_sub_tenant_role_idx
  on public.push_subscriptions (tenant_id, role);

alter table public.push_subscriptions enable row level security;

-- Telefon (anon) zapisuje/aktualizuje własną subskrypcję (upsert po endpoint).
-- Odczyt i wysyłka tylko przez service_role (Edge Function) — brak polityki SELECT dla anon.
drop policy if exists "push_sub_anon_insert" on public.push_subscriptions;
create policy "push_sub_anon_insert" on public.push_subscriptions
  for insert to anon with check (true);
drop policy if exists "push_sub_anon_update" on public.push_subscriptions;
create policy "push_sub_anon_update" on public.push_subscriptions
  for update to anon using (true) with check (true);
