-- PANEL MENEDŻERSKI + APLIKACJA — INSTALATOR PEŁNY (wklej CAŁOŚĆ do Supabase SQL Editor → Run)
-- Wygenerowany automatycznie ze wszystkich plików supabase/migrations/ (0001-0057) + seed_app_accounts.sql.
-- Każda migracja jest idempotentna (create...if not exists / drop...if exists+create) — bezpiecznie
-- uruchomić ten plik w CAŁOŚCI nawet jeśli część z nich była już wcześniej wklejona osobno.
-- NIE zawiera kroków spoza SQL (Auth Confirm-email OFF, pg_cron extension, Database Webhooks,
-- sekrety Edge Functions, alter database ... set app.whatsapp_key) — patrz PANEL_DEPLOY.md.


-- ========== 0001_init.sql ==========
-- Conrad Comfort — schemat HK (Housekeeping)
-- Multi-tenant: każda tabela zawiera tenant_id UUID
-- Uruchomić: supabase db push

-- ─── hk_workers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hk_workers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hk_workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_hk_workers" ON public.hk_workers;
CREATE POLICY "anon_read_hk_workers" ON public.hk_workers
  FOR SELECT TO anon USING (true);

-- ─── hk_rooms ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hk_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  room_no     text NOT NULL,
  room_type   text,
  floor       smallint,
  is_apt      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, room_no)
);
ALTER TABLE public.hk_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_hk_rooms" ON public.hk_rooms;
CREATE POLICY "anon_read_hk_rooms" ON public.hk_rooms
  FOR SELECT TO anon USING (true);

-- ─── hk_tasks ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hk_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  date_key    date NOT NULL,
  room_no     text NOT NULL,
  status      text,
  person      text,
  br          boolean NOT NULL DEFAULT false,
  zs          boolean NOT NULL DEFAULT false,
  room_type   text,
  auto_source text,
  manual_override boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hk_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_hk_tasks" ON public.hk_tasks;
CREATE POLICY "anon_read_hk_tasks" ON public.hk_tasks
  FOR SELECT TO anon USING (true);

-- ─── hk_logs ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hk_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  date_key    date NOT NULL,
  room_no     text NOT NULL,
  event       text NOT NULL,
  actor       text,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hk_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_hk_logs" ON public.hk_logs;
CREATE POLICY "anon_read_hk_logs" ON public.hk_logs
  FOR SELECT TO anon USING (true);

-- ─── hk_plan ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hk_plan (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  date_key      date NOT NULL,
  source        text,
  dry_run       boolean NOT NULL DEFAULT false,
  data          jsonb NOT NULL DEFAULT '{}',
  generated_at  timestamptz,
  saved_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, date_key, source)
);
ALTER TABLE public.hk_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_hk_plan" ON public.hk_plan;
CREATE POLICY "anon_read_hk_plan" ON public.hk_plan
  FOR SELECT TO anon USING (true);

-- ========== 0002_app_tables.sql ==========
-- Conrad Comfort — schemat pozostałych tabel aplikacji
-- Multi-tenant: każda tabela zawiera tenant_id UUID
-- Uruchomić: supabase db push

-- ─── rooms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  room_no     text NOT NULL,
  label       text,
  floor       smallint,
  is_apartment boolean NOT NULL DEFAULT false,
  is_trpl     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, room_no)
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_rooms" ON public.rooms;
CREATE POLICY "anon_read_rooms" ON public.rooms FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_rooms" ON public.rooms;
CREATE POLICY "anon_write_rooms" ON public.rooms FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── managers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.managers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  name          text NOT NULL,
  password_hash text,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_managers" ON public.managers;
CREATE POLICY "anon_read_managers" ON public.managers FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_managers" ON public.managers;
CREATE POLICY "anon_write_managers" ON public.managers FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── app_settings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  key         text NOT NULL,
  value       text,
  encrypted   boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_app_settings" ON public.app_settings;
CREATE POLICY "anon_read_app_settings" ON public.app_settings FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_app_settings" ON public.app_settings;
CREATE POLICY "anon_write_app_settings" ON public.app_settings FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── default_tasks ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.default_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  shift_key   text NOT NULL,
  body        text NOT NULL,
  mandatory   boolean NOT NULL DEFAULT false,
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.default_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_default_tasks" ON public.default_tasks;
CREATE POLICY "anon_read_default_tasks" ON public.default_tasks FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_default_tasks" ON public.default_tasks;
CREATE POLICY "anon_write_default_tasks" ON public.default_tasks FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── manager_alerts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manager_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  title        text NOT NULL,
  body         text NOT NULL,
  priority     text NOT NULL DEFAULT 'normal',
  pinned       boolean NOT NULL DEFAULT false,
  target_shift text,
  expires_at   timestamptz,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.manager_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_manager_alerts" ON public.manager_alerts;
CREATE POLICY "anon_read_manager_alerts" ON public.manager_alerts FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_manager_alerts" ON public.manager_alerts;
CREATE POLICY "anon_write_manager_alerts" ON public.manager_alerts FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── standing_reminders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.standing_reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.standing_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_standing_reminders" ON public.standing_reminders;
CREATE POLICY "anon_read_standing_reminders" ON public.standing_reminders FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_standing_reminders" ON public.standing_reminders;
CREATE POLICY "anon_write_standing_reminders" ON public.standing_reminders FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── faults ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.faults (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  floor        text,
  space_id     text,
  category     text,
  description  text NOT NULL,
  reported_by  text,
  assigned_to  text,
  status       text NOT NULL DEFAULT 'open',
  priority     text NOT NULL DEFAULT 'normal',
  photo_url    text,
  resolved_at  timestamptz,
  resolved_by  text,
  reported_at  timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.faults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_faults" ON public.faults;
CREATE POLICY "anon_read_faults" ON public.faults FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_faults" ON public.faults;
CREATE POLICY "anon_write_faults" ON public.faults FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  channel     text NOT NULL DEFAULT 'general',
  type        text NOT NULL DEFAULT 'text',
  sender      text NOT NULL,
  recipient   text,
  body        text NOT NULL,
  payload     jsonb,
  shift_key   text,
  date_key    date,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_messages" ON public.messages;
CREATE POLICY "anon_read_messages" ON public.messages FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_messages" ON public.messages;
CREATE POLICY "anon_write_messages" ON public.messages FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── vouchers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vouchers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  code           text,
  type           text NOT NULL,
  amount         numeric,
  recipient      text,
  recipient_type text NOT NULL DEFAULT 'guest',
  issued_by      text,
  date_key       date,
  notes          text,
  status         text NOT NULL DEFAULT 'issued',
  used_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_vouchers" ON public.vouchers;
CREATE POLICY "anon_read_vouchers" ON public.vouchers FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_vouchers" ON public.vouchers;
CREATE POLICY "anon_write_vouchers" ON public.vouchers FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── booking_reviews ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  platform    text NOT NULL DEFAULT 'booking',
  guest       text,
  rating      numeric,
  text_pos    text,
  text_neg    text,
  reply       text,
  stay_date   date,
  review_date date,
  source_id   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_id)
);
ALTER TABLE public.booking_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_booking_reviews" ON public.booking_reviews;
CREATE POLICY "anon_read_booking_reviews" ON public.booking_reviews FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_booking_reviews" ON public.booking_reviews;
CREATE POLICY "anon_write_booking_reviews" ON public.booking_reviews FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── schedule ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schedule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  date_key    date NOT NULL,
  employee    text NOT NULL,
  shift_key   text,
  start_time  text,
  end_time    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, date_key, employee)
);
ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_schedule" ON public.schedule;
CREATE POLICY "anon_read_schedule" ON public.schedule FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_schedule" ON public.schedule;
CREATE POLICY "anon_write_schedule" ON public.schedule FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── shift_reports ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shift_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  employee    text NOT NULL,
  shift_key   text NOT NULL,
  date_key    date NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shift_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_shift_reports" ON public.shift_reports;
CREATE POLICY "anon_read_shift_reports" ON public.shift_reports FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_shift_reports" ON public.shift_reports;
CREATE POLICY "anon_write_shift_reports" ON public.shift_reports FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── daily_reports ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  date_key    date NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, date_key)
);
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_daily_reports" ON public.daily_reports;
CREATE POLICY "anon_read_daily_reports" ON public.daily_reports FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_daily_reports" ON public.daily_reports;
CREATE POLICY "anon_write_daily_reports" ON public.daily_reports FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── payment_corrections ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_corrections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  employee    text NOT NULL,
  amount      numeric NOT NULL,
  reason      text,
  shift_key   text,
  date_key    date,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_payment_corrections" ON public.payment_corrections;
CREATE POLICY "anon_read_payment_corrections" ON public.payment_corrections FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_payment_corrections" ON public.payment_corrections;
CREATE POLICY "anon_write_payment_corrections" ON public.payment_corrections FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── hk_adhoc_tasks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hk_adhoc_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  room_no        text,
  task           text NOT NULL,
  broadcast_mode text NOT NULL DEFAULT 'all',
  assigned_to    text,
  done           boolean NOT NULL DEFAULT false,
  shift_key      text,
  date_key       date NOT NULL,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hk_adhoc_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_hk_adhoc_tasks" ON public.hk_adhoc_tasks;
CREATE POLICY "anon_read_hk_adhoc_tasks" ON public.hk_adhoc_tasks FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_hk_adhoc_tasks" ON public.hk_adhoc_tasks;
CREATE POLICY "anon_write_hk_adhoc_tasks" ON public.hk_adhoc_tasks FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── caretaker_tokens ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caretaker_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  token       text NOT NULL,
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, token)
);
ALTER TABLE public.caretaker_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_caretaker_tokens" ON public.caretaker_tokens;
CREATE POLICY "anon_read_caretaker_tokens" ON public.caretaker_tokens FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_caretaker_tokens" ON public.caretaker_tokens;
CREATE POLICY "anon_write_caretaker_tokens" ON public.caretaker_tokens FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── push_subscriptions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  employee    text NOT NULL,
  endpoint    text NOT NULL,
  keys_p256dh text NOT NULL,
  keys_auth   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, endpoint)
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "anon_read_push_subscriptions" ON public.push_subscriptions FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_write_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "anon_write_push_subscriptions" ON public.push_subscriptions FOR ALL TO anon USING (true) WITH CHECK (true);

-- ========== 0003_hk_write_policies.sql ==========
-- Dodanie polityk zapisu (INSERT/UPDATE/DELETE) dla tabel HK
-- Analogicznie do anon_write_* w 0002_app_tables.sql

DROP POLICY IF EXISTS "anon_write_hk_workers" ON public.hk_workers;
CREATE POLICY "anon_write_hk_workers" ON public.hk_workers
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_write_hk_rooms" ON public.hk_rooms;
CREATE POLICY "anon_write_hk_rooms" ON public.hk_rooms
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_write_hk_tasks" ON public.hk_tasks;
CREATE POLICY "anon_write_hk_tasks" ON public.hk_tasks
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_write_hk_logs" ON public.hk_logs;
CREATE POLICY "anon_write_hk_logs" ON public.hk_logs
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_write_hk_plan" ON public.hk_plan;
CREATE POLICY "anon_write_hk_plan" ON public.hk_plan
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ========== 0004_faults.sql ==========
-- 0004_faults.sql
-- UJEDNOLICENIE usterek: jedna tabela public.faults (recepcja + HK z telefonu).
-- Rozszerza ISTNIEJĄCĄ tabelę z 0002 (nie tworzy drugiej).
-- Wymóg: usterek nie można usuwać; opis i zdjęcia są niezmienne (trwały zapis w chmurze).
-- Status pozostaje w słowniku istniejącym: 'open' | 'in_progress' | 'done'.

-- 1) Nowe kolumny dla zgłoszeń z telefonu HK
alter table public.faults add column if not exists source text not null default 'reception'; -- 'reception' | 'hk'
alter table public.faults add column if not exists room   text;                              -- numer pokoju (HK)
alter table public.faults add column if not exists photos text[] not null default '{}';       -- wiele zdjęć (HK); recepcja używa też photo_url

-- 1b) Pola workflow recepcji (FaultFormModal / FaultDetailsModal) — bez nich
--     insert/update z recepcji byłby odrzucany przez PostgREST (nieznane kolumny).
alter table public.faults add column if not exists due_at          timestamptz; -- termin wykonania
alter table public.faults add column if not exists started_at      timestamptz; -- rozpoczęcie naprawy
alter table public.faults add column if not exists completed_at    timestamptz; -- zakończenie naprawy
alter table public.faults add column if not exists completion_note text;        -- notatka konserwatora

-- 2) Niezmienność + brak usuwania: zdejmij permisywną politykę FOR ALL z 0002,
--    zostaw odczyt, dodaj INSERT i UPDATE, NIE dodawaj DELETE => usuwanie zablokowane.
drop policy if exists "anon_write_faults" on public.faults;
drop policy if exists "faults_anon_insert" on public.faults;
drop policy if exists "faults_anon_update" on public.faults;
create policy "faults_anon_insert" on public.faults for insert to anon with check (true);
create policy "faults_anon_update" on public.faults for update to anon using (true) with check (true);
-- (polityka SELECT "anon_read_faults" z 0002 pozostaje)

-- 3) Trigger: opis, zdjęcia i metadane zgłoszenia są nietykalne; edytowalny status/przypisanie/rozwiązanie.
create or replace function public.faults_block_immutable()
returns trigger language plpgsql as $$
begin
  if NEW.id          <> OLD.id
     or NEW.tenant_id  is distinct from OLD.tenant_id
     or NEW.reported_at <> OLD.reported_at
     or NEW.source      is distinct from OLD.source
     or NEW.room        is distinct from OLD.room
     or NEW.description is distinct from OLD.description
     or NEW.photos      is distinct from OLD.photos
     or NEW.photo_url   is distinct from OLD.photo_url then
    raise exception 'Usterki są niezmienne — nie wolno zmieniać opisu/zdjęć/metadanych zgłoszenia.';
  end if;
  if NEW.status not in ('open','in_progress','done') then
    raise exception 'Nieprawidłowy status usterki: %', NEW.status;
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists faults_immutable on public.faults;
create trigger faults_immutable
  before update on public.faults
  for each row execute function public.faults_block_immutable();

-- 4) Storage na zdjęcia usterek (publiczny odczyt, dodawanie tak, usuwanie NIE).
insert into storage.buckets (id, name, public)
  values ('hk-faults', 'hk-faults', true)
  on conflict (id) do nothing;

drop policy if exists "hk_faults_obj_read"   on storage.objects;
drop policy if exists "hk_faults_obj_insert" on storage.objects;
create policy "hk_faults_obj_read"   on storage.objects for select to anon using (bucket_id = 'hk-faults');
create policy "hk_faults_obj_insert" on storage.objects for insert to anon with check (bucket_id = 'hk-faults');
-- brak update/delete dla bucketu 'hk-faults' => zdjęcia trwałe.

-- ========== 0005_standing_reminders_category.sql ==========
-- 0005_standing_reminders_category.sql
-- StandingRemindersPanel wstawia pole `category` (kategoria przypomnienia), a tabela
-- z 0002 tej kolumny nie miała → PostgREST odrzucał insert i przypomnienia nie
-- zapisywały się do chmury (zostawały tylko w localStorage). Dodajemy kolumnę.

alter table public.standing_reminders add column if not exists category text;

-- ========== 0006_llm_usage.sql ==========
-- 0006_llm_usage.sql
-- Rejestr zużycia LLM (proxy Edge Function `llm`) — pod kontrolę kosztu,
-- limity per-tenant i ewentualne rozliczenie premium-tier.
-- Wpisy dodaje wyłącznie Edge Function (service_role → omija RLS).
-- Recepcja może odczytać własne zużycie (np. licznik w panelu admina).

create table if not exists public.llm_usage (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  task       text not null,              -- 'wiki' | 'triage' | 'briefing'
  model      text,                       -- użyty model LLM (Groq)
  tokens_in  int  not null default 0,
  tokens_out int  not null default 0,
  ok         boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists llm_usage_tenant_day_idx
  on public.llm_usage (tenant_id, created_at);

alter table public.llm_usage enable row level security;

-- Odczyt zużycia (anon) — zapis i tak tylko przez service_role z Edge Function.
drop policy if exists "llm_usage_anon_read" on public.llm_usage;
create policy "llm_usage_anon_read"
  on public.llm_usage for select to anon
  using (true);

-- ========== 0007_push_subscriptions.sql ==========
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

-- ========== 0008_shift_reports.sql ==========
-- 0008_shift_reports.sql
-- Raporty zmiany recepcji + stan kasy w Supabase (dotąd tylko localStorage = per-komputer).
-- Dzięki temu Historia jest widoczna na każdym urządzeniu i dla pracowników.
-- Liczenie kasy pozostaje w aplikacji (deterministyczne) — tu tylko trwały zapis.

create table if not exists public.shift_reports (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  day_key       date not null,          -- logiczny dzień zmiany (data startu)
  shift_key     text not null,          -- poranna|popoludniowa|nocna|wieczorowa
  employee      text,
  saved_at      timestamptz not null,
  cash_opening  numeric,                -- kasa na start
  cash_closing  numeric,                -- KW końcowe (z dokumentów)
  kw_prev       numeric,                -- łączne KW poprzedniej zmiany
  safe_total    numeric,                -- kwota w sejfie (start + KW)
  cash_current  numeric,                -- gotówka bieżąca
  handover      text,                   -- notatka przekazania
  tasks_done    int,
  tasks_total   int,
  report        jsonb,                  -- pełny wpis raportu (zadania, braki, itd.)
  created_at    timestamptz not null default now()
);

-- Uzupełnij kolumny, gdyby tabela istniała w niepełnej wersji z wcześniejszej próby.
alter table public.shift_reports add column if not exists tenant_id    uuid;
alter table public.shift_reports add column if not exists day_key      date;
alter table public.shift_reports add column if not exists shift_key    text;
alter table public.shift_reports add column if not exists employee     text;
alter table public.shift_reports add column if not exists saved_at     timestamptz;
alter table public.shift_reports add column if not exists cash_opening numeric;
alter table public.shift_reports add column if not exists cash_closing numeric;
alter table public.shift_reports add column if not exists kw_prev      numeric;
alter table public.shift_reports add column if not exists safe_total   numeric;
alter table public.shift_reports add column if not exists cash_current numeric;
alter table public.shift_reports add column if not exists handover     text;
alter table public.shift_reports add column if not exists tasks_done   int;
alter table public.shift_reports add column if not exists tasks_total  int;
alter table public.shift_reports add column if not exists report       jsonb;
alter table public.shift_reports add column if not exists created_at   timestamptz default now();

create index if not exists shift_reports_tenant_day_idx
  on public.shift_reports (tenant_id, day_key desc);

alter table public.shift_reports enable row level security;

-- Odczyt dla wszystkich (Historia widoczna pracownikom), zapis i usuwanie przez anon.
-- (porzucona zmiana w ciągu 10 min kasuje swój wpis — patrz resetView w App.jsx)
drop policy if exists "shift_reports_anon_read"   on public.shift_reports;
drop policy if exists "shift_reports_anon_insert" on public.shift_reports;
drop policy if exists "shift_reports_anon_delete" on public.shift_reports;
create policy "shift_reports_anon_read"   on public.shift_reports for select to anon using (true);
create policy "shift_reports_anon_insert" on public.shift_reports for insert to anon with check (true);
create policy "shift_reports_anon_delete" on public.shift_reports for delete to anon using (true);

-- ========== 0009_hk_roster.sql ==========
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

-- ========== 0010_panel_auth.sql ==========
-- 0010_panel_auth.sql
-- Panel menedżerski: logowanie po imieniu (spis) + pierwsze hasło (Supabase Auth),
-- role i mapa konto->rola. Osobne od tabeli `managers` (logowanie kierownika w apce React).
-- Hasła trzyma Supabase Auth (bcrypt) — tu NIE ma hasła, tylko spis + rola + powiązanie z auth.users.

-- ─── app_accounts ─────────────────────────────────────────────────────────────
create table if not exists public.app_accounts (
  user_id    uuid unique references auth.users(id) on delete set null, -- null = konto jeszcze nieprzejęte
  tenant_id  uuid not null,
  name       text not null,            -- wyświetlane imię (spis logowania)
  email      text not null unique,     -- syntetyczny, ukryty login: <slug>@conrad-panel.com
  role       text not null check (role in
               ('admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')),
  claimed    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.app_accounts enable row level security;

-- Spis na ekranie logowania (imię/rola/email/claimed). Hasła tu nie ma, więc odczyt jest bezpieczny.
drop policy if exists "accounts_public_list" on public.app_accounts;
create policy "accounts_public_list" on public.app_accounts
  for select to anon, authenticated using (true);

-- ─── current_app_role() ───────────────────────────────────────────────────────
-- Rola zalogowanego użytkownika — używana przez panel po zalogowaniu oraz przez RLS
-- w kolejnych iteracjach (polityki tabel danych będą sprawdzać current_app_role()).
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.app_accounts where user_id = auth.uid()
$$;

-- ─── claim_account(email) ─────────────────────────────────────────────────────
-- Pierwsze logowanie: po utworzeniu konta Auth (signUp) wiążemy je z wierszem spisu.
-- Działa tylko gdy wiersz jest jeszcze nieprzejęty (user_id is null). Zwraca rolę.
create or replace function public.claim_account(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null then
    raise exception 'Brak zalogowania.';
  end if;
  update public.app_accounts
     set user_id = auth.uid(), claimed = true
   where email = p_email and user_id is null
   returning role into v_role;
  -- Gdy wiersz był już przejęty/email nieznany — zwróć rolę bieżącego usera (jeśli to jego konto).
  if v_role is null then
    select role into v_role from public.app_accounts where user_id = auth.uid();
  end if;
  return v_role;
end $$;

grant execute on function public.current_app_role()      to anon, authenticated;
grant execute on function public.claim_account(text)     to anon, authenticated;

-- ─── Dostęp dla zalogowanych (authenticated) do tabel czytanych przez panel ─────
-- Istniejące polityki są tylko `TO anon`, więc zalogowany użytkownik panelu (rola
-- `authenticated`) NIE widziałby tych danych. Te tabele są i tak publicznie czytelne
-- przez anon — dokładamy więc równoważny odczyt dla authenticated (bez regresu).
-- Zapis pozostaje jak był; panel na razie tylko czyta.
do $$
declare t text;
begin
  foreach t in array array[
    'hk_plan','hk_rooms','hk_logs','hk_tasks','hk_workers',
    'faults','shift_reports','hk_adhoc_tasks','schedule','hk_roster'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_auth_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_auth_read', t);
  end loop;
end $$;

-- ========== 0011_panel_recepcja.sql ==========
-- 0011_panel_recepcja.sql
-- Iteracja 3 panelu: recepcja/koordynator — przekazane zadania + stan kasy.
-- Komputer recepcji (App.jsx) czyta `manager_alerts` na żywo; panel pozwala je DODAWAĆ z telefonu.
-- shift_reports ma już odczyt dla authenticated (0010 dodał *_auth_read) — tu dokładamy
-- odczyt + zapis manager_alerts dla zalogowanych z rolą panelu.

-- Odczyt manager_alerts dla zalogowanych (lista przekazanych zadań w panelu).
drop policy if exists "manager_alerts_auth_read" on public.manager_alerts;
create policy "manager_alerts_auth_read" on public.manager_alerts
  for select to authenticated using (true);

-- Zapis: tylko zalogowani z przypisaną rolą panelu (current_app_role() != null).
-- Dzięki temu „przekazanie zadania na komputer" działa, ale nie dla przypadkowego anona z kluczem.
drop policy if exists "manager_alerts_auth_insert" on public.manager_alerts;
create policy "manager_alerts_auth_insert" on public.manager_alerts
  for insert to authenticated
  with check ( public.current_app_role() is not null );

-- ========== 0012_panel_grafik.sql ==========
-- 0012_panel_grafik.sql
-- Iteracja 4 panelu: GRAFIK = zbiórka dostępności przez linki per osoba (bez haseł).
-- Bezpieczeństwo: dostęp do danych WYŁĄCZNIE przez funkcje SECURITY DEFINER. Tabele mają
-- włączony RLS i ZERO polityk → bezpośredni odczyt/zapis (anon i authenticated) jest zablokowany.
-- Pracownik używa losowego tokenu (sekret w URL); menedżer — swojej roli (current_app_role()).

-- ─── Tabele ───────────────────────────────────────────────────────────────────
create table if not exists public.availability_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  period_type  text not null check (period_type in ('week','month')),
  period_start date not null,
  created_by   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.availability_tokens (
  token       text primary key,
  request_id  uuid not null references public.availability_requests(id) on delete cascade,
  person      text not null,
  kind        text not null default 'hk',   -- 'hk' (dzień/popołudnie) | 'recepcja' (zmiany)
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists availability_tokens_req_idx on public.availability_tokens(request_id);

create table if not exists public.availability_entries (
  token      text not null references public.availability_tokens(token) on delete cascade,
  date       date not null,
  choice     text not null,                  -- dzien|popoludnie|off | poranna|popoludniowa|nocna
  updated_at timestamptz not null default now(),
  primary key (token, date)
);

alter table public.availability_requests enable row level security;
alter table public.availability_tokens   enable row level security;
alter table public.availability_entries  enable row level security;
-- celowo BRAK polityk: dostęp tylko przez funkcje poniżej (SECURITY DEFINER).

-- ─── Menedżer: utwórz prośbę o grafik + wygeneruj linki per osoba ──────────────
-- UWAGA: funkcje grafiku logują akcje przez public.log_action() z migracji 0013_panel_audit.sql.
-- Uruchom 0013 po 0012 (plpgsql rozwiązuje nazwy funkcji przy wywołaniu, nie przy tworzeniu).
create or replace function public.create_availability_request(
  p_period_type text, p_period_start date, p_persons text[], p_kind text
) returns table(person text, token text)
language plpgsql security definer set search_path = public as $$
declare v_req uuid; v_p text; v_tok text; v_kind text; v_n int := 0;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  if p_period_type not in ('week','month') then raise exception 'Zły okres.'; end if;
  v_kind := coalesce(nullif(p_kind,''), 'hk');
  insert into public.availability_requests(tenant_id, period_type, period_start, created_by)
    values ('00000000-0000-0000-0000-000000000001', p_period_type, p_period_start,
            (select name from public.app_accounts where user_id = auth.uid()))
    returning id into v_req;
  foreach v_p in array p_persons loop
    if length(coalesce(trim(v_p),'')) = 0 then continue; end if;
    -- Krótki, niezgadywalny kod (6 znaków hex, unikalny). Daje krótkie linki.
    loop
      v_tok := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists (select 1 from public.availability_tokens t where t.token = v_tok);
    end loop;
    insert into public.availability_tokens(token, request_id, person, kind, active)
      values (v_tok, v_req, trim(v_p), v_kind, true);
    person := trim(v_p); token := v_tok; v_n := v_n + 1; return next;
  end loop;
  perform public.log_action('grafik_utworzony',
    format('Wysłał grafik (%s) od %s dla %s os.', p_period_type, p_period_start, v_n), null);
end $$;

-- ─── Pracownik: odczyt swojego grafiku po tokenie ─────────────────────────────
create or replace function public.get_availability(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  select json_build_object(
    'person', t.person, 'kind', t.kind,
    'period_type', r.period_type, 'period_start', r.period_start,
    'entries', coalesce((select json_agg(json_build_object('date', e.date, 'choice', e.choice))
                         from public.availability_entries e where e.token = t.token), '[]'::json)
  ) into v
  from public.availability_tokens t
  join public.availability_requests r on r.id = t.request_id
  where t.token = p_token and t.active;
  return v; -- null gdy token zły/nieaktywny
end $$;

-- ─── Pracownik: zapis jednego dnia ────────────────────────────────────────────
create or replace function public.set_availability(p_token text, p_date date, p_choice text)
returns void language plpgsql security definer set search_path = public as $$
declare v_person text; v_old text;
begin
  select person into v_person from public.availability_tokens where token = p_token and active;
  if v_person is null then raise exception 'Nieprawidłowy lub nieaktywny link.'; end if;
  if p_choice not in ('dzien','popoludnie','off','poranna','popoludniowa','nocna') then
    raise exception 'Zła wartość wyboru.'; end if;
  select choice into v_old from public.availability_entries where token = p_token and date = p_date;
  insert into public.availability_entries(token, date, choice)
    values (p_token, p_date, p_choice)
    on conflict (token, date) do update set choice = excluded.choice, updated_at = now();
  perform public.log_action(
    case when v_old is null then 'grafik_wpis' else 'grafik_edycja' end,
    format('%s: %s%s', p_date, p_choice, case when v_old is null then '' else ' (było: '||v_old||')' end),
    v_person);
end $$;

-- ─── Menedżer: lista próśb + zbiorcza siatka odpowiedzi ───────────────────────
-- drop: gdy ten plik jest ponownie uruchamiany na bazie, która przeszła już
-- przez 0028/0048 (szersza sygnatura), samo "create or replace" nie wystarczy —
-- Postgres nie pozwala zwęzić kolumn OUT bez jawnego DROP FUNCTION najpierw.
drop function if exists public.list_availability_requests();
create or replace function public.list_availability_requests()
returns table(id uuid, period_type text, period_start date, created_by text,
              created_at timestamptz, persons bigint, answered bigint)
language sql stable security definer set search_path = public as $$
  select r.id, r.period_type, r.period_start, r.created_by, r.created_at,
         (select count(*) from public.availability_tokens t where t.request_id = r.id) as persons,
         (select count(distinct e.token) from public.availability_entries e
            join public.availability_tokens t on t.token = e.token where t.request_id = r.id) as answered
  from public.availability_requests r
  where public.current_app_role() is not null
  order by r.created_at desc limit 50;
$$;

-- drop: ten sam powód co wyżej — 0024/0031 poszerzają kolumny OUT.
drop function if exists public.get_request_grid(uuid);
create or replace function public.get_request_grid(p_request_id uuid)
returns table(person text, token text, kind text, date date, choice text)
language sql stable security definer set search_path = public as $$
  select t.person, t.token, t.kind, e.date, e.choice
  from public.availability_tokens t
  left join public.availability_entries e on e.token = t.token
  where t.request_id = p_request_id and public.current_app_role() is not null
  order by t.person, e.date;
$$;

-- ─── Uprawnienia wykonania ────────────────────────────────────────────────────
grant execute on function public.get_availability(text)                       to anon, authenticated;
grant execute on function public.set_availability(text, date, text)           to anon, authenticated;
grant execute on function public.create_availability_request(text, date, text[], text) to authenticated;
grant execute on function public.list_availability_requests()                 to authenticated;
grant execute on function public.get_request_grid(uuid)                       to authenticated;

-- ========== 0013_panel_audit.sql ==========
-- 0013_panel_audit.sql
-- Spis akcji panelu: kto co zrobił / edytował (grafik, zadania itd.).
-- Dostęp tylko przez funkcje SECURITY DEFINER (tabela ma RLS bez polityk).
-- Uruchom PO 0012 (funkcje grafiku wołają public.log_action()).

create table if not exists public.panel_audit (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  actor      text,            -- imię osoby/menedżera (lub '—')
  actor_role text,            -- rola panelu (null dla pracownika z linku)
  action     text not null,   -- grafik_utworzony | grafik_wpis | grafik_edycja | zadanie_dodane | ...
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists panel_audit_created_idx on public.panel_audit(created_at desc);

alter table public.panel_audit enable row level security;  -- brak polityk: dostęp przez RPC

-- Zapis wpisu audytu. p_actor podawane jawnie dla akcji pracownika (anon po tokenie);
-- dla menedżera (authenticated) brane z app_accounts po auth.uid().
create or replace function public.log_action(p_action text, p_detail text, p_actor text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text; v_role text;
begin
  v_role  := public.current_app_role();
  v_actor := coalesce(p_actor, (select name from public.app_accounts where user_id = auth.uid()));
  insert into public.panel_audit(actor, actor_role, action, detail)
    values (coalesce(v_actor, '—'), v_role, p_action, p_detail);
end $$;

-- Odczyt ostatnich akcji (tylko zalogowani z rolą panelu).
create or replace function public.list_panel_audit()
returns table(actor text, actor_role text, action text, detail text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select actor, actor_role, action, detail, created_at
  from public.panel_audit
  where public.current_app_role() is not null
  order by created_at desc limit 100;
$$;

grant execute on function public.log_action(text, text, text) to anon, authenticated;
grant execute on function public.list_panel_audit()            to authenticated;

-- ========== 0014_panel_konserwatorzy.sql ==========
-- 0014_panel_konserwatorzy.sql
-- Iteracja 5 panelu: menedżer główny/operacyjny dodaje zadania konserwatorom.
-- Zadanie = wpis do `faults` (assigned_to = konserwator). Istniejący Database Webhook na INSERT
-- do `faults` automatycznie wyśle push (push-send) — bez dodatkowego kodu.
-- Odczyt faults dla authenticated dodaliśmy w 0010; tu dokładamy INSERT dla zalogowanych z rolą.

drop policy if exists "faults_auth_insert" on public.faults;
create policy "faults_auth_insert" on public.faults
  for insert to authenticated
  with check ( public.current_app_role() is not null );

-- ========== 0015_panel_admin_ttl.sql ==========
-- 0015_panel_admin_ttl.sql
-- Iteracja 6: panel admina (zakładanie kont + role) i TTL 14 dni dla danych panelu.
-- Admin nie tworzy kont Auth ręcznie — wpisuje tylko imię+rolę do app_accounts; konto Auth
-- powstaje przy pierwszym logowaniu danej osoby (signUp + claim_account), jak dotąd.

-- Flaga aktywności konta (dezaktywowane znika ze spisu logowania).
alter table public.app_accounts add column if not exists active boolean not null default true;

-- ─── Admin: lista / dodanie / zmiana roli / aktywacja kont ─────────────────────
create or replace function public.admin_list_accounts()
returns table(name text, email text, role text, claimed boolean, active boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select name, email, role, claimed, active, created_at
  from public.app_accounts
  where public.current_app_role() = 'admin'
  order by created_at;
$$;

create or replace function public.admin_add_account(p_name text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  if p_role not in ('admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
    then raise exception 'Zła rola.'; end if;
  -- Email jest tylko wewnętrznym, ukrytym loginem — generujemy losowy i unikalny.
  v_email := 'acc_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10) || '@conrad-panel.com';
  insert into public.app_accounts(tenant_id, name, email, role)
    values ('00000000-0000-0000-0000-000000000001', trim(p_name), v_email, p_role);
  perform public.log_action('konto_dodane', format('%s (%s)', trim(p_name), p_role), null);
  return v_email;
end $$;

create or replace function public.admin_set_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if p_role not in ('admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
    then raise exception 'Zła rola.'; end if;
  update public.app_accounts set role = p_role where email = p_email;
  perform public.log_action('konto_rola', format('%s → %s', p_email, p_role), null);
end $$;

create or replace function public.admin_set_active(p_email text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  update public.app_accounts set active = p_active where email = p_email;
  perform public.log_action('konto_aktywne', format('%s = %s', p_email, p_active), null);
end $$;

grant execute on function public.admin_list_accounts()           to authenticated;
grant execute on function public.admin_add_account(text, text)   to authenticated;
grant execute on function public.admin_set_role(text, text)      to authenticated;
grant execute on function public.admin_set_active(text, boolean) to authenticated;

-- ─── TTL 14 dni — auto-czyszczenie TYLKO danych panelu ────────────────────────
-- Czyścimy dane panelu (audyt, grafiki, przekazane zadania). NIE ruszamy danych aplikacji
-- recepcji (shift_reports, hk_*, faults to historia/operacje recepcji).
create or replace function public.panel_ttl_cleanup()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.panel_audit            where created_at < now() - interval '14 days';
  delete from public.availability_requests  where created_at < now() - interval '14 days'; -- kaskada tokens/entries
  delete from public.manager_alerts         where created_at < now() - interval '14 days';
end $$;

-- Harmonogram: codziennie o 03:00 (wymaga rozszerzenia pg_cron — Dashboard → Database → Extensions).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'panel_ttl') then
      perform cron.unschedule('panel_ttl');
    end if;
    perform cron.schedule('panel_ttl', '0 3 * * *', 'select public.panel_ttl_cleanup();');
  else
    raise notice 'pg_cron nie jest wlaczone — TTL pominiete. Wlacz rozszerzenie i uruchom 0015 ponownie (albo wolaj panel_ttl_cleanup() recznie).';
  end if;
end $$;

-- ========== 0016_panel_hardening.sql ==========
-- 0016_panel_hardening.sql
-- Hardening panelu: oznaczanie zadań zrobionych, planowanie obsady, odwołanie/regeneracja
-- linków grafiku, reset hasła konta (admin), opcjonalny kod jednorazowy na 1. logowanie.

-- ── H3: oznaczanie przekazanych zadań (manager_alerts) jako zrobione ──
alter table public.manager_alerts add column if not exists done    boolean not null default false;
alter table public.manager_alerts add column if not exists done_at timestamptz;
alter table public.manager_alerts add column if not exists done_by text;
drop policy if exists "manager_alerts_auth_update" on public.manager_alerts;
create policy "manager_alerts_auth_update" on public.manager_alerts
  for update to authenticated
  using ( public.current_app_role() is not null )
  with check ( public.current_app_role() is not null );

-- ── H5: planowanie obsady HK z panelu (hk_roster: tenant_id+date → roster jsonb) ──
drop policy if exists "hk_roster_auth_insert" on public.hk_roster;
create policy "hk_roster_auth_insert" on public.hk_roster
  for insert to authenticated with check ( public.current_app_role() is not null );
drop policy if exists "hk_roster_auth_update" on public.hk_roster;
create policy "hk_roster_auth_update" on public.hk_roster
  for update to authenticated
  using ( public.current_app_role() is not null )
  with check ( public.current_app_role() is not null );

-- ── H2: odwołanie / regeneracja linku grafiku ──
create or replace function public.set_token_active(p_token text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  update public.availability_tokens set active = p_active where token = p_token;
end $$;

create or replace function public.regenerate_token(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare v_req uuid; v_person text; v_kind text; v_new text;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  select request_id, person, kind into v_req, v_person, v_kind from public.availability_tokens where token = p_token;
  if v_req is null then raise exception 'Nie znaleziono linku.'; end if;
  update public.availability_tokens set active = false where token = p_token;
  loop v_new := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
       exit when not exists (select 1 from public.availability_tokens t where t.token = v_new); end loop;
  insert into public.availability_tokens(token, request_id, person, kind, active)
    values (v_new, v_req, v_person, v_kind, true);
  perform public.log_action('grafik_link_reset', v_person, null);
  return v_new;
end $$;
grant execute on function public.set_token_active(text, boolean) to authenticated;
grant execute on function public.regenerate_token(text)         to authenticated;

-- ── H1: reset hasła konta (admin) — rotacja ukrytego e-maila wymusza nowe „pierwsze hasło” ──
create or replace function public.admin_reset_account(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_new text;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  v_new := 'acc_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10) || '@conrad-panel.com';
  update public.app_accounts set email = v_new, user_id = null, claimed = false where email = p_email;
  perform public.log_action('konto_reset', p_email, null);
  return v_new;
end $$;
grant execute on function public.admin_reset_account(text) to authenticated;

-- ── H4: opcjonalny kod jednorazowy na 1. logowanie (chroni przed przejęciem konta) ──
alter table public.app_accounts add column if not exists requires_code   boolean not null default false;
alter table public.app_accounts add column if not exists claim_code_hash text;
-- Hash kodu nie może być czytany przez klienta (kod jest krótki → md5 dałoby się złamać).
-- Funkcje SECURITY DEFINER (poniżej) i tak go widzą jako właściciel.
revoke select (claim_code_hash) on public.app_accounts from anon;
revoke select (claim_code_hash) on public.app_accounts from authenticated;

-- Wstępna weryfikacja kodu PRZED signUp (klient: jeśli ok → tworzy konto Auth).
create or replace function public.precheck_claim(p_email text, p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when a.requires_code is not true then true
              else a.claim_code_hash is not null and a.claim_code_hash = md5(coalesce(p_code, ''))
         end
  from public.app_accounts a where a.email = p_email;
$$;
grant execute on function public.precheck_claim(text, text) to anon, authenticated;

-- claim_account z kodem (2-argumentowa wersja — panel woła ją zawsze; kod=null gdy niewymagany).
create or replace function public.claim_account(p_email text, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_role text; v_req boolean; v_hash text;
begin
  if auth.uid() is null then raise exception 'Brak zalogowania.'; end if;
  select requires_code, claim_code_hash into v_req, v_hash from public.app_accounts where email = p_email;
  if v_req is true and (v_hash is null or v_hash <> md5(coalesce(p_code, ''))) then
    raise exception 'Nieprawidłowy kod.'; end if;
  update public.app_accounts set user_id = auth.uid(), claimed = true
    where email = p_email and user_id is null returning role into v_role;
  if v_role is null then select role into v_role from public.app_accounts where user_id = auth.uid(); end if;
  return v_role;
end $$;
grant execute on function public.claim_account(text, text) to anon, authenticated;

-- admin_add_account z opcjonalnym kodem (3-argumentowa wersja).
create or replace function public.admin_add_account(p_name text, p_role text, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text; v_has_code boolean;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  if p_role not in ('admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
    then raise exception 'Zła rola.'; end if;
  v_has_code := coalesce(trim(p_code),'') <> '';
  v_email := 'acc_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10) || '@conrad-panel.com';
  insert into public.app_accounts(tenant_id, name, email, role, requires_code, claim_code_hash)
    values ('00000000-0000-0000-0000-000000000001', trim(p_name), v_email, p_role,
            v_has_code, case when v_has_code then md5(trim(p_code)) else null end);
  perform public.log_action('konto_dodane',
    format('%s (%s)%s', trim(p_name), p_role, case when v_has_code then ' + kod' else '' end), null);
  return v_email;
end $$;
grant execute on function public.admin_add_account(text, text, text) to authenticated;

-- ========== 0017_panel_login.sql ==========
-- 0017_panel_login.sql
-- Logowanie „jak na poczcie": formularz login (imię) + hasło. Admin może USTAWIĆ/ZRESETOWAĆ
-- hasło dowolnego konta (bez Edge Function), aktualizując auth.users przez funkcję SECURITY DEFINER.

create extension if not exists pgcrypto with schema extensions;

-- Admin ustawia hasło konta (reset). Działa tylko dla kont już aktywnych w Auth.
-- Potwierdza też e-mail, więc logowanie działa nawet przy włączonym „Confirm email".
create or replace function public.admin_set_password(p_email text, p_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'Hasło min. 6 znaków.'; end if;
  select id into v_uid from auth.users where email = p_email;
  if v_uid is null then return false; end if;  -- konto jeszcze nieaktywne (osoba ustawi hasło sama)
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = v_uid;
  update public.app_accounts set claimed = true where email = p_email;
  perform public.log_action('konto_haslo', p_email, null);
  return true;
end $$;
grant execute on function public.admin_set_password(text, text) to authenticated;

-- ========== 0018_panel_board.sql ==========
-- 0018_panel_board.sql
-- Tablica: stałe przypomnienia (standing_reminders) widoczne i edytowalne z panelu.
-- manager_alerts i tak ma już polityki dla authenticated (0011). Tu dokładamy standing_reminders.

drop policy if exists "standing_reminders_auth_read" on public.standing_reminders;
create policy "standing_reminders_auth_read" on public.standing_reminders
  for select to authenticated using (true);

drop policy if exists "standing_reminders_auth_insert" on public.standing_reminders;
create policy "standing_reminders_auth_insert" on public.standing_reminders
  for insert to authenticated with check ( public.current_app_role() is not null );

drop policy if exists "standing_reminders_auth_update" on public.standing_reminders;
create policy "standing_reminders_auth_update" on public.standing_reminders
  for update to authenticated
  using ( public.current_app_role() is not null )
  with check ( public.current_app_role() is not null );

-- ========== 0019_panel_mirror.sql ==========
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

-- ========== 0020_panel_extra.sql ==========
-- 0020_panel_extra.sql
-- Admin może zmienić wyświetlany login (imię) konta, np. „Menedżer główny" → „Lukasz".

create or replace function public.admin_set_name(p_email text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  update public.app_accounts set name = trim(p_name) where email = p_email;
  perform public.log_action('konto_login', format('%s → %s', p_email, trim(p_name)), null);
end $$;
grant execute on function public.admin_set_name(text, text) to authenticated;

-- ========== 0021_panel_plan.sql ==========
-- 0021_panel_plan.sql
-- „Plan" obok usterek: rozpisanie zadań na każdy dzień (np. Parking) dla konserwatorów,
-- z możliwością wpisania odpowiedzi/statusu. Wzór dostępu jak faults (anon + authenticated).

create table if not exists public.panel_plan (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  plan        text not null,                 -- np. 'Parking'
  date        date not null,
  task        text not null,                 -- co wykonać danego dnia
  assigned_to text,                          -- konserwator (lub puste = dowolny)
  response    text,                          -- odpowiedź/uwaga wykonawcy
  status      text not null default 'open',  -- open | done
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists panel_plan_date_idx on public.panel_plan(tenant_id, date desc);

alter table public.panel_plan enable row level security;

drop policy if exists "panel_plan_anon" on public.panel_plan;
create policy "panel_plan_anon" on public.panel_plan for all to anon using (true) with check (true);

drop policy if exists "panel_plan_auth" on public.panel_plan;
create policy "panel_plan_auth" on public.panel_plan for all to authenticated using (true) with check (true);

-- ========== 0022_panel_grafik_ai.sql ==========
-- 0022_panel_grafik_ai.sql
-- Panel (zalogowany) może ZAPISYWAĆ do panel_mirror — m.in. propozycję grafiku (kind='proposed_schedule'),
-- którą aplikacja recepcji pobiera i wstawia do swojego grafiku.

drop policy if exists "panel_mirror_auth_write" on public.panel_mirror;
create policy "panel_mirror_auth_write" on public.panel_mirror
  for all to authenticated using (true) with check (true);

-- ========== 0023_panel_reviews.sql ==========
-- 0023_panel_reviews.sql
-- Recepcja widzi opinie gości (Booking) przez statystyki/raporty — odczyt dla zalogowanych.

drop policy if exists "booking_reviews_auth_read" on public.booking_reviews;
create policy "booking_reviews_auth_read" on public.booking_reviews
  for select to authenticated using (true);

-- ========== 0024_panel_grafik_hours.sql ==========
-- 0024_panel_grafik_hours.sql
-- Drugi tryb dyspozycyjności pracownika: własny zakres GODZIN (od-do), obok wyboru zmiany.
-- Rozwiązuje przypadek „mogę 16-22", którego sztywna zmiana 15-22 nie obejmuje.

alter table public.availability_entries add column if not exists start_h text;
alter table public.availability_entries add column if not exists end_h   text;

-- set_availability z opcjonalnymi godzinami (choice='godziny' + start/end). Stara 3-arg wersja zostaje.
create or replace function public.set_availability(p_token text, p_date date, p_choice text, p_start text default null, p_end text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_person text; v_old text;
begin
  select person into v_person from public.availability_tokens where token = p_token and active;
  if v_person is null then raise exception 'Nieprawidłowy lub nieaktywny link.'; end if;
  if p_choice not in ('dzien','popoludnie','off','poranna','popoludniowa','nocna','dzienna','godziny') then
    raise exception 'Zła wartość wyboru.'; end if;
  select choice into v_old from public.availability_entries where token = p_token and date = p_date;
  insert into public.availability_entries(token, date, choice, start_h, end_h)
    values (p_token, p_date, p_choice, nullif(p_start,''), nullif(p_end,''))
    on conflict (token, date) do update set choice = excluded.choice, start_h = excluded.start_h, end_h = excluded.end_h, updated_at = now();
  perform public.log_action(
    case when v_old is null then 'grafik_wpis' else 'grafik_edycja' end,
    format('%s: %s%s', p_date,
      case when p_choice='godziny' then coalesce(p_start,'')||'-'||coalesce(p_end,'') else p_choice end,
      case when v_old is null then '' else ' (było: '||v_old||')' end),
    v_person);
end $$;
grant execute on function public.set_availability(text, date, text, text, text) to anon, authenticated;

-- get_availability zwraca też godziny.
create or replace function public.get_availability(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  select json_build_object(
    'person', t.person, 'kind', t.kind, 'period_type', r.period_type, 'period_start', r.period_start,
    'entries', coalesce((select json_agg(json_build_object('date', e.date, 'choice', e.choice, 'start', e.start_h, 'end', e.end_h))
                         from public.availability_entries e where e.token = t.token), '[]'::json)
  ) into v
  from public.availability_tokens t
  join public.availability_requests r on r.id = t.request_id
  where t.token = p_token and t.active;
  return v;
end $$;

-- get_request_grid zwraca też godziny (zmiana typu zwracanego → drop+create).
drop function if exists public.get_request_grid(uuid);
create function public.get_request_grid(p_request_id uuid)
returns table(person text, token text, kind text, date date, choice text, start_h text, end_h text)
language sql stable security definer set search_path = public as $$
  select t.person, t.token, t.kind, e.date, e.choice, e.start_h, e.end_h
  from public.availability_tokens t
  left join public.availability_entries e on e.token = t.token
  where t.request_id = p_request_id and public.current_app_role() is not null
  order by t.person, e.date;
$$;
grant execute on function public.get_request_grid(uuid) to authenticated;

-- ========== 0025_panel_hk.sql ==========
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

-- ========== 0026_panel_grafik_delete.sql ==========
-- 0026_panel_grafik_delete.sql
-- Usuwanie wcześniejszych/niepotrzebnych grafików (availability_request) z panelu.
-- Kasuje też tokeny i odpowiedzi pracowników dzięki FK ON DELETE CASCADE.
-- Menedżer może usuwać tylko własne grafiki; admin — dowolne (jak filtr widoczności w panelu).

create or replace function public.delete_availability_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_me text; v_owner text;
begin
  v_role := public.current_app_role();
  if v_role is null then raise exception 'Brak uprawnień.'; end if;
  select name into v_me from public.app_accounts where user_id = auth.uid();
  select created_by into v_owner from public.availability_requests where id = p_request_id;
  if v_owner is null then return; end if; -- już usunięty / nie istnieje
  if v_role <> 'admin' and coalesce(v_owner,'') <> coalesce(v_me,'') then
    raise exception 'Możesz usuwać tylko własne grafiki.';
  end if;
  delete from public.availability_requests where id = p_request_id; -- kaskada tokens/entries
  perform public.log_action('grafik_usuniety', format('Usunął grafik %s', p_request_id), null);
end $$;

grant execute on function public.delete_availability_request(uuid) to authenticated;

-- ========== 0027_panel_hk_quality.sql ==========
-- 0027_panel_hk_quality.sql
-- Trzy elementy żądane przez kierownika HK:
--   1) hk_qc_settings     — ustawienia losowej kontroli pokoi (tryb, osoba, pytania)
--   2) hk_quality_checks  — pojedyncze losowe kontrole (kto, pokój, pytania, odpowiedzi)
--   3) hk_reminder_acks   — potwierdzenia przeczytania przypomnień (każdy musi przeklikać)
-- Telefon HK używa klucza anon → polityki anon (read/insert/update), jak hk_roster.

-- ── 1. Ustawienia losowej kontroli ───────────────────────────────────────────
create table if not exists public.hk_qc_settings (
  tenant_id     uuid primary key,
  enabled       boolean not null default true,
  mode          text    not null default 'random',   -- 'random' | 'person'
  chosen_person text,                                 -- gdy mode='person'
  daily_limit   int     not null default 4,           -- ile kontroli losowych na dzień
  items         jsonb   not null default
    '["Sprawdziłaś pod łóżkiem?","Stan czajnika (czysty, woda, kubki)?","Ręczniki uzupełnione?","Łazienka — kosmetyki i papier?","Minibar uzupełniony?","Zasłony / okno domknięte?"]',
  updated_at    timestamptz not null default now()
);

alter table public.hk_qc_settings enable row level security;
drop policy if exists "hk_qc_settings_read"  on public.hk_qc_settings;
drop policy if exists "hk_qc_settings_write" on public.hk_qc_settings;
create policy "hk_qc_settings_read"  on public.hk_qc_settings for select to anon, authenticated using (true);
create policy "hk_qc_settings_write" on public.hk_qc_settings for all to anon, authenticated using (true) with check (true);

-- ── 2. Losowe kontrole pokoi ──────────────────────────────────────────────────
create table if not exists public.hk_quality_checks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  date          date not null,
  room          text not null,
  cleaned_by    text,                                 -- kto sprzątał pokój
  target_worker text not null,                        -- kto ma sprawdzić (cel kontroli)
  items         jsonb not null default '[]',          -- [{q:"...", checked:bool}]
  status        text  not null default 'pending',     -- 'pending' | 'done'
  created_at    timestamptz not null default now(),
  acked_at      timestamptz
);
create index if not exists hk_quality_checks_day_idx
  on public.hk_quality_checks(tenant_id, date, created_at desc);
create index if not exists hk_quality_checks_target_idx
  on public.hk_quality_checks(tenant_id, date, target_worker, status);

alter table public.hk_quality_checks enable row level security;
drop policy if exists "hk_quality_checks_read"  on public.hk_quality_checks;
drop policy if exists "hk_quality_checks_write" on public.hk_quality_checks;
create policy "hk_quality_checks_read"  on public.hk_quality_checks for select to anon, authenticated using (true);
create policy "hk_quality_checks_write" on public.hk_quality_checks for all to anon, authenticated using (true) with check (true);

-- ── 3. Potwierdzenia przypomnień ─────────────────────────────────────────────
create table if not exists public.hk_reminder_acks (
  reminder_id uuid not null,
  worker      text not null,
  acked_at    timestamptz not null default now(),
  primary key (reminder_id, worker)
);
create index if not exists hk_reminder_acks_worker_idx on public.hk_reminder_acks(worker);

alter table public.hk_reminder_acks enable row level security;
drop policy if exists "hk_reminder_acks_read"  on public.hk_reminder_acks;
drop policy if exists "hk_reminder_acks_write" on public.hk_reminder_acks;
create policy "hk_reminder_acks_read"  on public.hk_reminder_acks for select to anon, authenticated using (true);
create policy "hk_reminder_acks_write" on public.hk_reminder_acks for all to anon, authenticated using (true) with check (true);

-- ── Realtime: natychmiastowy modal kontroli/przypomnienia na telefonie ───────
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='hk_quality_checks') then
    alter publication supabase_realtime add table public.hk_quality_checks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='hk_reminders') then
    alter publication supabase_realtime add table public.hk_reminders;
  end if;
end $$;

-- ========== 0028_panel_grafik_ttl_hk.sql ==========
-- 0028_panel_grafik_ttl_hk.sql
-- Dwie zmiany w GRAFIKU (zbiórka dyspozycyjności):
--  1) OKNO CZASU: link jest aktywny tylko przez wybrane okno (24h / 48h / 7 dni). Po tym
--     czasie „system się zamyka" — get_availability zwraca null, a set_availability odmawia.
--     Menedżer wybiera okno przy wysyłce (p_ttl_hours). Stare grafiki bez expires_at = bez limitu.
--  2) HK = dwie wersje zmiany: Rano (poranna) i Popołudnie. Pracownik może zaznaczyć jedną
--     LUB obie (choice 'oba'). Dodajemy 'oba' do dozwolonych wartości.
-- Bazuje na żywych definicjach z 0024 (godziny) — modyfikuje je o okno czasu i 'oba'.

-- ─── 1. Okno czasu na requeście ───────────────────────────────────────────────
alter table public.availability_requests add column if not exists expires_at timestamptz;

-- ─── Menedżer: utwórz prośbę z oknem czasu (p_ttl_hours; domyślnie 24h) ────────
-- Zmiana sygnatury → usuwamy starą 4-arg wersję i tworzymy 5-arg z domyślnym p_ttl_hours,
-- żeby istniejące wywołania (bez okna) nadal działały (24h).
drop function if exists public.create_availability_request(text, date, text[], text);
create or replace function public.create_availability_request(
  p_period_type text, p_period_start date, p_persons text[], p_kind text, p_ttl_hours int default 24
) returns table(person text, token text)
language plpgsql security definer set search_path = public as $$
declare v_req uuid; v_p text; v_tok text; v_kind text; v_n int := 0; v_ttl int; v_exp timestamptz;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  if p_period_type not in ('week','month') then raise exception 'Zły okres.'; end if;
  v_kind := coalesce(nullif(p_kind,''), 'hk');
  -- Akceptujemy tylko sensowne okna; spoza zakresu → 24h.
  v_ttl := coalesce(p_ttl_hours, 24);
  if v_ttl not in (24, 48, 168) then v_ttl := 24; end if;
  v_exp := now() + (v_ttl || ' hours')::interval;
  insert into public.availability_requests(tenant_id, period_type, period_start, created_by, expires_at)
    values ('00000000-0000-0000-0000-000000000001', p_period_type, p_period_start,
            (select name from public.app_accounts where user_id = auth.uid()), v_exp)
    returning id into v_req;
  foreach v_p in array p_persons loop
    if length(coalesce(trim(v_p),'')) = 0 then continue; end if;
    loop
      v_tok := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists (select 1 from public.availability_tokens t where t.token = v_tok);
    end loop;
    insert into public.availability_tokens(token, request_id, person, kind, active)
      values (v_tok, v_req, trim(v_p), v_kind, true);
    person := trim(v_p); token := v_tok; v_n := v_n + 1; return next;
  end loop;
  perform public.log_action('grafik_utworzony',
    format('Wysłał grafik (%s) od %s dla %s os. (okno %sh)', p_period_type, p_period_start, v_n, v_ttl), null);
end $$;
grant execute on function public.create_availability_request(text, date, text[], text, int) to authenticated;

-- ─── Pracownik: odczyt grafiku — tylko gdy aktywny i w oknie czasu ─────────────
-- Zwraca też expires_at (do licznika na stronie). Po wygaśnięciu → null (strona pokaże „zamknięte").
create or replace function public.get_availability(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  select json_build_object(
    'person', t.person, 'kind', t.kind, 'period_type', r.period_type, 'period_start', r.period_start,
    'expires_at', r.expires_at,
    'entries', coalesce((select json_agg(json_build_object('date', e.date, 'choice', e.choice, 'start', e.start_h, 'end', e.end_h))
                         from public.availability_entries e where e.token = t.token), '[]'::json)
  ) into v
  from public.availability_tokens t
  join public.availability_requests r on r.id = t.request_id
  where t.token = p_token and t.active
    and (r.expires_at is null or r.expires_at > now());
  return v;
end $$;
grant execute on function public.get_availability(text) to anon, authenticated;

-- ─── Pracownik: zapis dnia — odmowa po wygaśnięciu okna; HK dopuszcza 'oba' ─────
create or replace function public.set_availability(p_token text, p_date date, p_choice text, p_start text default null, p_end text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_person text; v_old text; v_exp timestamptz;
begin
  select t.person, r.expires_at into v_person, v_exp
    from public.availability_tokens t
    join public.availability_requests r on r.id = t.request_id
    where t.token = p_token and t.active;
  if v_person is null then raise exception 'Nieprawidłowy lub nieaktywny link.'; end if;
  if v_exp is not null and v_exp <= now() then raise exception 'Zbiórka zamknięta — link wygasł.'; end if;
  if p_choice not in ('dzien','popoludnie','off','poranna','popoludniowa','nocna','dzienna','godziny','oba') then
    raise exception 'Zła wartość wyboru.'; end if;
  select choice into v_old from public.availability_entries where token = p_token and date = p_date;
  insert into public.availability_entries(token, date, choice, start_h, end_h)
    values (p_token, p_date, p_choice, nullif(p_start,''), nullif(p_end,''))
    on conflict (token, date) do update set choice = excluded.choice, start_h = excluded.start_h, end_h = excluded.end_h, updated_at = now();
  perform public.log_action(
    case when v_old is null then 'grafik_wpis' else 'grafik_edycja' end,
    format('%s: %s%s', p_date,
      case when p_choice='godziny' then coalesce(p_start,'')||'-'||coalesce(p_end,'') else p_choice end,
      case when v_old is null then '' else ' (było: '||v_old||')' end),
    v_person);
end $$;
grant execute on function public.set_availability(text, date, text, text, text) to anon, authenticated;

-- ─── Menedżer: lista próśb zwraca też expires_at (licznik / „zamknięte" w panelu) ─
drop function if exists public.list_availability_requests();
create function public.list_availability_requests()
returns table(id uuid, period_type text, period_start date, created_by text,
              created_at timestamptz, expires_at timestamptz, persons bigint, answered bigint)
language sql stable security definer set search_path = public as $$
  select r.id, r.period_type, r.period_start, r.created_by, r.created_at, r.expires_at,
         (select count(*) from public.availability_tokens t where t.request_id = r.id) as persons,
         (select count(distinct e.token) from public.availability_entries e
            join public.availability_tokens t on t.token = e.token where t.request_id = r.id) as answered
  from public.availability_requests r
  where public.current_app_role() is not null
  order by r.created_at desc limit 50;
$$;
grant execute on function public.list_availability_requests() to authenticated;

-- ========== 0029_fix_availability_entries_hours.sql ==========
-- 0029_fix_availability_entries_hours.sql
-- FIX dryfu schematu: w realnej bazie funkcje get_availability/set_availability/get_request_grid
-- (z 0024 i 0028) odwołują się do availability_entries.start_h / end_h, ale te KOLUMNY nigdy nie
-- zostały dodane (0024 wgrane tylko częściowo — funkcje tak, ALTER TABLE nie).
--
-- Objaw: pracownik otwiera link z grafiku → get_availability rzuca
--   "column e.start_h does not exist" → supabase-js zwraca data=null →
--   grafik.html pokazuje „Link nieaktywny", mimo że token jest ważny (np. okno 24h).
--
-- To jest TYLKO uzupełnienie kolumn. NIE redefiniujemy funkcji, żeby nie cofnąć
-- zmian z 0028 (expires_at, choice 'oba'). Idempotentne — bezpieczne do ponownego uruchomienia.

alter table public.availability_entries add column if not exists start_h text;
alter table public.availability_entries add column if not exists end_h   text;

-- ========== 0030_grafik_multi_shift.sql ==========
-- 0030_grafik_multi_shift.sql
-- Dwie rzeczy:
--   1) FIX zapisu kafelków: w realnej bazie istniały DWIE funkcje set_availability —
--      stara 3-arg (0012) i nowa 5-arg (0024/0028). Wywołanie z 3 argumentami było dla
--      PostgREST niejednoznaczne (PGRST203 „Could not choose the best candidate function"),
--      więc klik zmiany kończył się „Nie zapisano", a zapis godzin (5 argów) działał.
--      Usuwamy starą wersję, zostaje jedna funkcja.
--   2) WIELE ZMIAN na dzień: recepcja może zaznaczyć kilka zmian naraz (np. "poranna,nocna").
--      Walidacja sprawdza teraz KAŻDĄ część rozdzieloną przecinkiem, a nie całość.
-- Idempotentne / bezpieczne do ponownego uruchomienia.

-- Kolumny godzin (gdyby 0029 nie było wgrane) — bez nich INSERT poniżej rzuca błędem.
alter table public.availability_entries add column if not exists start_h text;
alter table public.availability_entries add column if not exists end_h   text;

-- (1) Usuń starą, kolidującą wersję 3-argumentową.
drop function if exists public.set_availability(text, date, text);

-- (2) Redefinicja wersji 5-arg z walidacją per-część (obsługa "poranna,nocna").
create or replace function public.set_availability(p_token text, p_date date, p_choice text, p_start text default null, p_end text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_person text; v_old text; v_exp timestamptz; v_part text;
begin
  select t.person, r.expires_at into v_person, v_exp
    from public.availability_tokens t
    join public.availability_requests r on r.id = t.request_id
    where t.token = p_token and t.active;
  if v_person is null then raise exception 'Nieprawidłowy lub nieaktywny link.'; end if;
  if v_exp is not null and v_exp <= now() then raise exception 'Zbiórka zamknięta — link wygasł.'; end if;
  -- Każda część (rozdzielona przecinkiem) musi być dozwoloną zmianą.
  foreach v_part in array string_to_array(p_choice, ',') loop
    if btrim(v_part) not in ('dzien','popoludnie','off','poranna','popoludniowa','nocna','dzienna','godziny','oba') then
      raise exception 'Zła wartość wyboru: %', v_part; end if;
  end loop;
  select choice into v_old from public.availability_entries where token = p_token and date = p_date;
  insert into public.availability_entries(token, date, choice, start_h, end_h)
    values (p_token, p_date, p_choice, nullif(p_start,''), nullif(p_end,''))
    on conflict (token, date) do update set choice = excluded.choice, start_h = excluded.start_h, end_h = excluded.end_h, updated_at = now();
  perform public.log_action(
    case when v_old is null then 'grafik_wpis' else 'grafik_edycja' end,
    format('%s: %s%s', p_date,
      case when p_choice='godziny' then coalesce(p_start,'')||'-'||coalesce(p_end,'') else p_choice end,
      case when v_old is null then '' else ' (było: '||v_old||')' end),
    v_person);
end $$;
grant execute on function public.set_availability(text, date, text, text, text) to anon, authenticated;

-- ========== 0031_grafik_pref_hours.sql ==========
-- 0031_grafik_pref_hours.sql
-- GRAFIK (zbiórka dyspozycyjności): preferowana liczba godzin na kolejny okres.
--   Pracownik wpisuje na dole strony grafiku JEDNĄ liczbę — ile godzin chce przepracować
--   w kolejnym miesiącu. To wartość per osoba (token), nie per dzień. Menedżer widzi ją
--   w podglądzie odpowiedzi. Niezależna od dziennej dyspozycyjności (godziny od–do).
-- Idempotentne / bezpieczne do ponownego uruchomienia.

-- ─── Kolumna preferencji na tokenie (jedna wartość per osoba w danej zbiórce) ───
alter table public.availability_tokens add column if not exists pref_hours int;

-- ─── Pracownik: zapis preferowanej liczby godzin (walidacja okna czasu jak set_availability) ───
create or replace function public.set_pref_hours(p_token text, p_hours int)
returns void language plpgsql security definer set search_path = public as $$
declare v_person text; v_exp timestamptz;
begin
  select t.person, r.expires_at into v_person, v_exp
    from public.availability_tokens t
    join public.availability_requests r on r.id = t.request_id
    where t.token = p_token and t.active;
  if v_person is null then raise exception 'Nieprawidłowy lub nieaktywny link.'; end if;
  if v_exp is not null and v_exp <= now() then raise exception 'Zbiórka zamknięta — link wygasł.'; end if;
  if p_hours is not null and (p_hours < 0 or p_hours > 400) then
    raise exception 'Liczba godzin poza zakresem (0–400).'; end if;
  update public.availability_tokens set pref_hours = p_hours where token = p_token;
  perform public.log_action('grafik_edycja',
    format('preferencja godzin na okres: %s', coalesce(p_hours::text, '—')), v_person);
end $$;
grant execute on function public.set_pref_hours(text, int) to anon, authenticated;

-- ─── Pracownik: odczyt grafiku zwraca też pref_hours (do wczytania pola na stronie) ───
-- Bazuje na żywej definicji z 0028 (expires_at, godziny w entries) — dokładamy pref_hours.
create or replace function public.get_availability(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  select json_build_object(
    'person', t.person, 'kind', t.kind, 'period_type', r.period_type, 'period_start', r.period_start,
    'expires_at', r.expires_at, 'pref_hours', t.pref_hours,
    'entries', coalesce((select json_agg(json_build_object('date', e.date, 'choice', e.choice, 'start', e.start_h, 'end', e.end_h))
                         from public.availability_entries e where e.token = t.token), '[]'::json)
  ) into v
  from public.availability_tokens t
  join public.availability_requests r on r.id = t.request_id
  where t.token = p_token and t.active
    and (r.expires_at is null or r.expires_at > now());
  return v;
end $$;
grant execute on function public.get_availability(text) to anon, authenticated;

-- ─── Menedżer: siatka odpowiedzi zwraca też pref_hours (podgląd w panelu) ───
drop function if exists public.get_request_grid(uuid);
create function public.get_request_grid(p_request_id uuid)
returns table(person text, token text, kind text, date date, choice text, start_h text, end_h text, pref_hours int)
language sql stable security definer set search_path = public as $$
  select t.person, t.token, t.kind, e.date, e.choice, e.start_h, e.end_h, t.pref_hours
  from public.availability_tokens t
  left join public.availability_entries e on e.token = t.token
  where t.request_id = p_request_id and public.current_app_role() is not null
  order by t.person, e.date;
$$;
grant execute on function public.get_request_grid(uuid) to authenticated;

-- ========== 0032_hk_state.sql ==========
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

-- ========== 0033_grafik_schedule.sql ==========
-- 0033_grafik_schedule.sql
-- UŁOŻONY GRAFIK (finalny): koordynator z zebranej dyspozycyjności układa konkretne zmiany
--   w edytowalnej tabeli (osoby × dni) i zapisuje je. Jeden grafik na zbiórkę (request_id).
--   Komórki trzymamy w JSONB { "Osoba|YYYY-MM-DD": "8–16", ... } — proste do zapisu naraz
--   i do późniejszego odczytu pod wspólny link / druk.
-- Status: 'draft' (szkic) | 'published' (opublikowany). Idempotentne.

create table if not exists public.schedules (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.availability_requests(id) on delete cascade,
  tenant_id   uuid not null default '00000000-0000-0000-0000-000000000001',
  status      text not null default 'draft',
  cells       jsonb not null default '{}'::jsonb,
  created_by  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  published_at timestamptz,
  unique(request_id)
);

-- ─── Koordynator: odczyt ułożonego grafiku (szkic lub opublikowany) ───
create or replace function public.get_schedule(p_request_id uuid)
returns json language sql stable security definer set search_path = public as $$
  select case when public.current_app_role() is null then null else
    (select json_build_object('status', s.status, 'cells', s.cells,
                              'published_at', s.published_at, 'updated_at', s.updated_at)
       from public.schedules s where s.request_id = p_request_id) end;
$$;
grant execute on function public.get_schedule(uuid) to authenticated;

-- ─── Koordynator: zapis / publikacja ułożonego grafiku (upsert per zbiórka) ───
create or replace function public.save_schedule(p_request_id uuid, p_cells jsonb, p_status text default 'draft')
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_who text;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  v_status := case when p_status = 'published' then 'published' else 'draft' end;
  v_who := (select name from public.app_accounts where user_id = auth.uid());
  insert into public.schedules(request_id, status, cells, created_by, updated_at,
                               published_at)
    values (p_request_id, v_status, coalesce(p_cells, '{}'::jsonb), v_who, now(),
            case when v_status = 'published' then now() else null end)
  on conflict (request_id) do update set
    status = excluded.status,
    cells = excluded.cells,
    updated_at = now(),
    published_at = case when excluded.status = 'published' then now() else public.schedules.published_at end;
  perform public.log_action(
    case when v_status = 'published' then 'grafik_opublikowany' else 'grafik_ulozony' end,
    format('Ułożony grafik (%s) — %s pól', v_status, (select count(*) from jsonb_object_keys(coalesce(p_cells,'{}'::jsonb)))),
    v_who);
end $$;
grant execute on function public.save_schedule(uuid, jsonb, text) to authenticated;

-- ========== 0034_schedule_realtime.sql ==========
-- 0034_schedule_realtime.sql
-- GRAFIK „Zmiany" — dwukierunkowa synchronizacja NA ŻYWO między aplikacją recepcji
-- (App.jsx, klucz anon) a panelem menedżerskim (panel.html, zalogowany). Dotąd grafik
-- był wypychany JEDNOKIERUNKOWO przez pushMirror (snapshot kolumny `data`), a panel
-- tylko go czytał. Teraz obie strony mogą edytować, a zmiany scalają się per-komórka.
--
-- Dokument `data` (jsonb) w wierszu (tenant_id, kind='schedule'):
--   { "YYYY-MM-DD": { "Agata": {"start":"7","end":"15","shift":"poranna"}, ... }, ... }
--
-- Wzór 1:1 z hk_state (migracja 0032): merge po stronie bazy nie kasuje cudzych
-- komórek, `rev` rośnie monotonicznie (last-write-wins per komórka), a
-- `updated_device` pozwala klientowi zignorować WŁASNE echo realtime (inaczej
-- powstałaby pętla zapis→event→zapis).
-- Różnica wobec hk_state: merge jest O JEDEN POZIOM GŁĘBSZY, bo grafik to
-- {dzień: {pracownik: {...}}} — scalamy po pracowniku w obrębie dnia.
-- Idempotentne.

alter table public.panel_mirror add column if not exists rev            bigint not null default 0;
alter table public.panel_mirror add column if not exists updated_device text;

-- ── Atomowy 2-poziomowy merge grafiku + bump rev. Zwraca nowy wiersz. ────────
-- Wywołanie: supabase.rpc('schedule_merge', { p_cells, p_device, p_tenant })
create or replace function public.schedule_merge(
  p_cells  jsonb,
  p_device text default null,
  p_tenant uuid  default '00000000-0000-0000-0000-000000000001'
) returns public.panel_mirror
language plpgsql security definer set search_path = public as $$
declare
  r   public.panel_mirror;
  d   jsonb;
  dk  text;
begin
  -- Wczytaj bieżący dokument (albo pusty) i scal po dniu→pracowniku.
  select coalesce(pm.data, '{}'::jsonb) into d
    from public.panel_mirror pm
    where pm.tenant_id = p_tenant and pm.kind = 'schedule'
    for update;
  if d is null then d := '{}'::jsonb; end if;
  for dk in select jsonb_object_keys(coalesce(p_cells, '{}'::jsonb)) loop
    d := jsonb_set(d, array[dk], coalesce(d->dk, '{}'::jsonb) || (p_cells->dk), true);
  end loop;

  insert into public.panel_mirror(tenant_id, kind, data, rev, updated_device, updated_at)
  values (p_tenant, 'schedule', d, 1, p_device, now())
  on conflict (tenant_id, kind) do update
    set data           = d,
        rev            = public.panel_mirror.rev + 1,
        updated_device = p_device,
        updated_at     = now()
  returning * into r;
  return r;
end $$;

grant execute on function public.schedule_merge(jsonb, text, uuid) to anon, authenticated;

-- ── Realtime: każdy zapis natychmiast trafia na pozostałe urządzenia ─────────
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='panel_mirror'
  ) then
    alter publication supabase_realtime add table public.panel_mirror;
  end if;
end $$;

-- ========== 0035_manager_alerts_target_date.sql ==========
-- 0035_manager_alerts_target_date.sql
-- ZADANIA przekazywane z panelu menedżera na recepcję (manager_alerts) zyskują
-- KONKRETNĄ DATĘ celu. Dotąd zadanie miało tylko `target_shift` (zmianę) i było
-- widoczne na recepcji od razu — nie dało się zaplanować zadania „na poniedziałek
-- popołudniową". Panel ma teraz kalendarz wyboru dnia/zmiany/osoby, a recepcja
-- pokazuje takie zadanie dopiero w tym dniu (App.jsx/InboxPanel/PreShiftModal
-- filtrują: !target_date || target_date === dzisiejszy klucz).
--
--   NULL          → zadanie bez daty (zachowanie jak dotąd: widoczne od razu,
--                   filtrowane tylko po zmianie).
--   'YYYY-MM-DD'  → zadanie widoczne wyłącznie w tym dniu.
--
-- Idempotentne.

alter table public.manager_alerts add column if not exists target_date date;

-- ========== 0036_manager_alerts_kind.sql ==========
-- 0036_manager_alerts_kind.sql
-- ROZRÓŻNIENIE: alert/ogłoszenie vs ZADANIE. Dotąd wszystko z manager_alerts trafiało
-- na recepcji do „Informacje → Pilne" (kanał alertów). Zadania wysyłane z panelu
-- menedżera powinny trafiać do zakładki „Zadania" pracownika (sekcja „Zadania
-- przekazane tej zmianie"), a nie do Pilnych.
--
--   kind='alert' (domyślnie) → ogłoszenie/info: „Informacje → Pilne" + PreShiftModal (ack).
--   kind='task'              → zadanie z panelu: zakładka „Zadania" pracownika.
--                              Zadanie PILNE (priority='high') pokazuje się DODATKOWO
--                              jako alert w „Pilne" i wymaga potwierdzenia przed zmianą.
--
-- Odhaczenie zadania przez recepcję ustawia done/done_at/done_by (te kolumny już
-- istnieją — panel.markZadanieDone ich używa), więc panel widzi „zrobione" na żywo.
-- Idempotentne.

alter table public.manager_alerts add column if not exists kind text not null default 'alert';

-- ========== 0037_manager_mail.sql ==========
-- 0037_manager_mail.sql
-- POCZTA WEWNĘTRZNA menedżerów (panel ↔ panel). Dotąd jedyny kanał przekazywania
-- zadań z panelu (manager_alerts) był celowany na ZMIANĘ RECEPCJI (target_shift),
-- więc nie nadaje się na korespondencję osoba↔osoba/rola. Tu dokładamy osobny,
-- „mailowy" kanał między kontami panelu (app_accounts):
--
--   • adresat = konkretna OSOBA (to_email) ALBO cała ROLA (to_role) — broadcast,
--   • typ wiadomości kind: 'prosba' (wymaga odpowiedzi/akceptacji) | 'zadanie' (do
--     odhaczenia) | 'info' (do wiadomości),
--   • wątki/odpowiedzi przez thread_id (= id pierwszej wiadomości wątku) + parent_id,
--   • statusy: open → in_progress → done | rejected (z reply_note = powód/notatka),
--   • read_at = znacznik przeczytania (badge nieprzeczytanych w panelu).
--
-- Bezpieczeństwo: tabela RLS-only (zero polityk anon). Czyta/pisze wyłącznie zalogowane
-- konto panelu (current_app_role() != null). Widzisz wiadomość, gdy jesteś nadawcą,
-- adresatem imiennym, należysz do adresowanej roli — albo jesteś adminem.
-- Idempotentne.

-- ─── Helper: e-mail (ukryty login) zalogowanego konta panelu ──────────────────
-- Analogiczny do current_app_role(); używany w politykach RLS poczty.
create or replace function public.current_app_email()
returns text language sql stable security definer set search_path = public as $$
  select email from public.app_accounts where user_id = auth.uid()
$$;
grant execute on function public.current_app_email() to anon, authenticated;

-- ─── Tabela ───────────────────────────────────────────────────────────────────
create table if not exists public.manager_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default '00000000-0000-0000-0000-000000000001',
  thread_id   uuid not null,                                  -- = id pierwszej wiadomości wątku
  parent_id   uuid,                                           -- odpowiedź na konkretną wiadomość
  from_email  text not null,                                  -- nadawca (app_accounts.email)
  from_name   text not null,
  from_role   text,
  to_email    text,                                           -- adresat imienny (XOR z to_role)
  to_role     text,                                           -- broadcast do roli
  subject     text not null,
  body        text not null,
  kind        text not null default 'prosba',                 -- prosba | zadanie | info
  priority    text not null default 'normal',                 -- normal | high
  status      text not null default 'open',                   -- open | in_progress | done | rejected
  read_at     timestamptz,
  done_at     timestamptz,
  done_by     text,
  reply_note  text,                                           -- powód odrzucenia / notatka odpowiedzi
  created_at  timestamptz not null default now(),
  check (to_email is not null or to_role is not null)
);

create index if not exists manager_messages_thread_idx on public.manager_messages (thread_id, created_at);
create index if not exists manager_messages_to_email_idx on public.manager_messages (to_email);
create index if not exists manager_messages_to_role_idx  on public.manager_messages (to_role);

alter table public.manager_messages enable row level security;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Odczyt: nadawca, adresat imienny, członek adresowanej roli, lub admin.
drop policy if exists "mm_read" on public.manager_messages;
create policy "mm_read" on public.manager_messages
  for select to authenticated using (
        from_email = public.current_app_email()
     or to_email   = public.current_app_email()
     or to_role    = public.current_app_role()
     or public.current_app_role() = 'admin'
  );

-- Zapis (wysłanie): zalogowane konto panelu, nadawca = ja.
drop policy if exists "mm_insert" on public.manager_messages;
create policy "mm_insert" on public.manager_messages
  for insert to authenticated with check (
        public.current_app_role() is not null
    and from_email = public.current_app_email()
  );

-- Aktualizacja (przeczytane / status / odpowiedź-notatka): tylko uczestnik wątku.
drop policy if exists "mm_update" on public.manager_messages;
create policy "mm_update" on public.manager_messages
  for update to authenticated using (
        from_email = public.current_app_email()
     or to_email   = public.current_app_email()
     or to_role    = public.current_app_role()
     or public.current_app_role() = 'admin'
  ) with check (true);

-- ─── Realtime: nowa wiadomość / zmiana statusu wchodzi na żywo (badge) ────────
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='manager_messages'
  ) then
    alter publication supabase_realtime add table public.manager_messages;
  end if;
end $$;

-- ─── TTL: poczta starsza niż 30 dni znika (dłużej niż 14 dni zadań — to korespondencja) ─
create or replace function public.panel_ttl_cleanup()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.panel_audit            where created_at < now() - interval '14 days';
  delete from public.availability_requests  where created_at < now() - interval '14 days'; -- kaskada tokens/entries
  delete from public.manager_alerts         where created_at < now() - interval '14 days';
  delete from public.manager_messages       where created_at < now() - interval '30 days';
end $$;

-- ========== 0038_panel_login_audit.sql ==========
-- 0038_panel_login_audit.sql
-- Podgląd aktywności logowań (tylko admin): kto wszedł i czy coś zrobił.
-- Wymaga 0013_panel_audit.sql (tabela panel_audit + log_action). Akcja logowania
-- zapisywana z panelu jako action='logowanie'.

-- Sesje logowań: dla każdego wejścia liczymy ile akcji (innych niż samo logowanie)
-- wykonała ta sama osoba do następnego swojego logowania (albo do teraz).
-- actions = 0  →  „wszedł i nic nie zrobił".
create or replace function public.admin_login_sessions(p_days int default 14)
returns table(actor text, actor_role text, login_at timestamptz, actions int, last_action_at timestamptz)
language sql stable security definer set search_path = public as $$
  with logins as (
    select actor, actor_role, created_at as login_at,
           lead(created_at) over (partition by actor order by created_at) as next_login
    from public.panel_audit
    where action = 'logowanie'
      and created_at >= now() - make_interval(days => p_days)
  )
  select l.actor, l.actor_role, l.login_at,
    (select count(*)::int from public.panel_audit a
       where a.actor = l.actor and a.action <> 'logowanie'
         and a.created_at > l.login_at
         and (l.next_login is null or a.created_at < l.next_login)) as actions,
    (select max(a.created_at) from public.panel_audit a
       where a.actor = l.actor and a.action <> 'logowanie'
         and a.created_at > l.login_at
         and (l.next_login is null or a.created_at < l.next_login)) as last_action_at
  from logins l
  where public.current_app_role() = 'admin'
  order by l.login_at desc
  limit 200;
$$;

-- Pełny dziennik akcji (tylko admin) — z dłuższym limitem niż list_panel_audit.
create or replace function public.admin_list_audit(p_days int default 14, p_limit int default 300)
returns table(actor text, actor_role text, action text, detail text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select actor, actor_role, action, detail, created_at
  from public.panel_audit
  where public.current_app_role() = 'admin'
    and created_at >= now() - make_interval(days => p_days)
  order by created_at desc
  limit p_limit;
$$;

grant execute on function public.admin_login_sessions(int)      to authenticated;
grant execute on function public.admin_list_audit(int, int)     to authenticated;

-- ========== 0039_panel_notif_prefs.sql ==========
-- 0039_panel_notif_prefs.sql
-- PREFERENCJE POWIADOMIEŃ w panelu menedżerów (panel.html). Dotąd panel sygnalizował
-- tylko nową POCZTĘ (badge na zakładce). Pozostałe zdarzenia z mirrora recepcji
-- (korekty kasy, notatki służbowe, raporty zmian) i zadania przepływały bez żadnego
-- powiadomienia. Tu dokładamy per-konto wybór: KTO chce powiadomień O CZYM.
--
--   • przechowuje WYŁĄCZNIE preferencje (które kategorie włączone), nie stan
--     przeczytania — „nieprzeczytane" panel liczy po stronie klienta
--     (manager_messages.read_at + porównanie id snapshotów mirrora w localStorage),
--   • klucz = e-mail konta panelu (app_accounts.email), jak current_app_email(),
--   • prefs jsonb: { "poczta": true, "korekty": true, "notatki": true,
--                     "raporty": true, "zadania": true, "grafik": true },
--   • brak wiersza / brak klucza = DOMYŚLNIE WŁĄCZONE dla kategorii pasujących do
--     roli (klient ustala domyślne wg roli) — zero regresji, menedżer ODZNACZA
--     niechciane (np. kierownik recepcji: tylko korekty + notatki).
--
-- Bezpieczeństwo: RLS-only. Konto czyta/zapisuje WYŁĄCZNIE własny wiersz
-- (email = current_app_email()); admin widzi wszystkie (diagnostyka). Idempotentne.

create table if not exists public.panel_notif_prefs (
  tenant_id   uuid not null default '00000000-0000-0000-0000-000000000001',
  email       text not null,                 -- app_accounts.email (= current_app_email())
  prefs       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, email)
);

alter table public.panel_notif_prefs enable row level security;

-- Odczyt: własny wiersz lub admin.
drop policy if exists "pnp_read" on public.panel_notif_prefs;
create policy "pnp_read" on public.panel_notif_prefs
  for select to authenticated using (
        email = public.current_app_email()
     or public.current_app_role() = 'admin'
  );

-- Zapis (utworzenie): zalogowane konto panelu, wiersz = mój.
drop policy if exists "pnp_insert" on public.panel_notif_prefs;
create policy "pnp_insert" on public.panel_notif_prefs
  for insert to authenticated with check (
        public.current_app_role() is not null
    and email = public.current_app_email()
  );

-- Aktualizacja: tylko własny wiersz.
drop policy if exists "pnp_update" on public.panel_notif_prefs;
create policy "pnp_update" on public.panel_notif_prefs
  for update to authenticated using (
        email = public.current_app_email()
  ) with check (
        email = public.current_app_email()
  );

-- ========== 0040_wiki_entries.sql ==========
-- 0040_wiki_entries.sql
-- Wiki recepcji w bazie (dotąd tylko localStorage komputera recepcji).
-- Dzięki temu menedżer z panelu (Tablica → „Wpis do Wiki") dopisuje wprost do Wiki,
-- a recepcja synchronizuje wpisy NA ŻYWO — tak jak manager_alerts i standing_reminders.
--
-- id jest TEXT (nie uuid), by zachować dotychczasowe identyfikatory wpisów z recepcji
-- (seed „wiki1"/„wiki2" oraz crypto.randomUUID()). tenant_id = uuid (jak reszta tabel).
-- Idempotentne.

create table if not exists public.wiki_entries (
  id          text PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  topic       text NOT NULL,
  content     text NOT NULL DEFAULT '',
  images      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

alter table public.wiki_entries enable row level security;

-- Recepcja (App.jsx) działa na kluczu anon i sama edytuje Wiki — pełny dostęp jak standing_reminders (0002).
drop policy if exists "anon_read_wiki_entries"  on public.wiki_entries;
create policy "anon_read_wiki_entries"  on public.wiki_entries for select to anon using (true);
drop policy if exists "anon_write_wiki_entries" on public.wiki_entries;
create policy "anon_write_wiki_entries" on public.wiki_entries for all to anon using (true) with check (true);

-- Panel (zalogowany menedżer): odczyt dla wszystkich, zapis tylko z przypisaną rolą panelu.
drop policy if exists "wiki_entries_auth_read" on public.wiki_entries;
create policy "wiki_entries_auth_read" on public.wiki_entries
  for select to authenticated using (true);

drop policy if exists "wiki_entries_auth_insert" on public.wiki_entries;
create policy "wiki_entries_auth_insert" on public.wiki_entries
  for insert to authenticated with check ( public.current_app_role() is not null );

drop policy if exists "wiki_entries_auth_update" on public.wiki_entries;
create policy "wiki_entries_auth_update" on public.wiki_entries
  for update to authenticated
  using ( public.current_app_role() is not null )
  with check ( public.current_app_role() is not null );

drop policy if exists "wiki_entries_auth_delete" on public.wiki_entries;
create policy "wiki_entries_auth_delete" on public.wiki_entries
  for delete to authenticated
  using ( public.current_app_role() is not null );

-- Realtime: zapis z panelu/recepcji od razu trafia na pozostałe urządzenia.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='wiki_entries'
  ) then
    alter publication supabase_realtime add table public.wiki_entries;
  end if;
end $$;

-- ========== 0041_maintenance_plans.sql ==========
-- 0041_maintenance_plans.sql
-- Plany konserwacji: prosta lista aktywnych planów (menedżer wpisuje nazwę → plan powstaje),
-- do planu przypisuje konserwatorów (jednego / drugiego / obu) i dokłada zadania (z datą lub bez).
-- Zadania to wiersze w istniejącym `panel_plan` (dowiązane przez plan_id). Konserwator na każde
-- zadanie może odpowiedzieć (response) oraz dołączyć zdjęcie zmian (photos[]).
-- Wzór dostępu jak panel_plan/faults: anon (telefon konserwatora) + authenticated (panel).

create table if not exists public.maintenance_plans (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  name        text not null,                  -- nazwa planu wpisana przez menedżera
  assigned_to text,                            -- "" / null = jeszcze nieprzypisany (widzą obaj),
                                               -- "Grzegorz" / "Kamil" / "Grzegorz, Kamil" (obaj)
  status      text not null default 'active',  -- active | done
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists maintenance_plans_tenant_idx
  on public.maintenance_plans(tenant_id, status, created_at desc);

alter table public.maintenance_plans enable row level security;

drop policy if exists "maintenance_plans_anon" on public.maintenance_plans;
create policy "maintenance_plans_anon" on public.maintenance_plans for all to anon using (true) with check (true);

drop policy if exists "maintenance_plans_auth" on public.maintenance_plans;
create policy "maintenance_plans_auth" on public.maintenance_plans for all to authenticated using (true) with check (true);

-- panel_plan staje się listą ZADAŃ w obrębie planu.
alter table public.panel_plan add column if not exists plan_id uuid;
alter table public.panel_plan add column if not exists photos  jsonb not null default '[]'::jsonb;
-- Zadanie może nie mieć daty ("do wykonania" bez terminu).
alter table public.panel_plan alter column date drop not null;
create index if not exists panel_plan_plan_id_idx on public.panel_plan(plan_id);

-- Realtime: telefon konserwatora i panel widzą zmiany na żywo (poza 12-sek. pollingiem).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='maintenance_plans') then
    alter publication supabase_realtime add table public.maintenance_plans;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='panel_plan') then
    alter publication supabase_realtime add table public.panel_plan;
  end if;
end $$;

-- ========== 0042_found_items.sql ==========
-- 0042_found_items.sql
-- „Rzeczy znalezione" — działa tak samo jak usterki (faults): zgłoszenie z telefonu HK
-- (kto, kiedy, jaki pokój, co + zdjęcia), widoczne na recepcji (HK Live) i w panelu menedżera.
-- Wzór jak faults: anon insert + immutable opis/zdjęcia, brak DELETE, edytowalny tylko status.
-- Zdjęcia trafiają do istniejącego bucketu 'hk-faults' (anon read/insert).

create table if not exists public.found_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  room        text,                                  -- pokój, w którym znaleziono (może być puste)
  description text not null,                          -- co znaleziono
  photos      text[] not null default '{}',           -- zdjęcia (URL-e z bucketu hk-faults)
  reported_by text,                                   -- kto zgłosił (pracownik HK)
  source      text not null default 'hk',             -- 'hk' | 'reception'
  status      text not null default 'open',           -- open (w depozycie) | returned (oddane)
  returned_by   text,                                 -- kto oznaczył jako oddane
  returned_at   timestamptz,
  returned_note text,                                 -- komu oddano / uwaga
  reported_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists found_items_tenant_idx on public.found_items(tenant_id, reported_at desc);

alter table public.found_items enable row level security;

-- Odczyt + dodawanie dla anon (telefon HK), aktualizacja statusu też (jak faults).
drop policy if exists "found_items_anon_read"   on public.found_items;
drop policy if exists "found_items_anon_insert" on public.found_items;
drop policy if exists "found_items_anon_update" on public.found_items;
create policy "found_items_anon_read"   on public.found_items for select to anon using (true);
create policy "found_items_anon_insert" on public.found_items for insert to anon with check (true);
create policy "found_items_anon_update" on public.found_items for update to anon using (true) with check (true);

drop policy if exists "found_items_auth_all" on public.found_items;
create policy "found_items_auth_all" on public.found_items for all to authenticated using (true) with check (true);

-- Niezmienność zgłoszenia (opis/zdjęcia/metadane), edytowalny tylko status/oddanie.
create or replace function public.found_items_block_immutable()
returns trigger language plpgsql as $$
begin
  if NEW.id          <> OLD.id
     or NEW.tenant_id   is distinct from OLD.tenant_id
     or NEW.reported_at <> OLD.reported_at
     or NEW.source      is distinct from OLD.source
     or NEW.room        is distinct from OLD.room
     or NEW.description is distinct from OLD.description
     or NEW.photos      is distinct from OLD.photos
     or NEW.reported_by is distinct from OLD.reported_by then
    raise exception 'Rzeczy znalezione są niezmienne — nie wolno zmieniać opisu/zdjęć/metadanych zgłoszenia.';
  end if;
  if NEW.status not in ('open','returned') then
    raise exception 'Nieprawidłowy status rzeczy znalezionej: %', NEW.status;
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists found_items_immutable on public.found_items;
create trigger found_items_immutable
  before update on public.found_items
  for each row execute function public.found_items_block_immutable();

-- Realtime: recepcja (HK Live) i panel widzą nowe zgłoszenia na żywo.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='found_items') then
    alter publication supabase_realtime add table public.found_items;
  end if;
end $$;

-- ========== 0043_faults_sla_timing.sql ==========
-- 0043_faults_sla_timing.sql
-- Ożywia dashboard SLA menedżera (loadSLA w panel.html), który czyta due_at / started_at /
-- completed_at, ale dotąd te kolumny były wypełniane TYLKO przez desktopowy FaultDetailsModal.
-- Główna ścieżka terenowa (konserwacja.html) zapisywała resolved_at, nie completed_at, a HK/
-- telefon/addKonserwTask nie ustawiały due_at => metryki czasu i „po terminie" były martwe.
--
-- Rozwiązanie: jeden punkt w bazie (triggery), działa dla WSZYSTKICH klientów bez zmian w JS.
-- Wstecznie bezpieczne: uzupełnia wyłącznie puste pola, nigdy nie nadpisuje istniejących.

-- 1) BEFORE INSERT: automatyczny termin SLA z priorytetu + domknięcie czasów przy insertach
--    od razu w statusie in_progress/done. Defaulty kolumn (reported_at) są już przypisane do
--    NEW zanim odpali BEFORE INSERT, więc coalesce(NEW.reported_at, now()) jest bezpieczny.
create or replace function public.faults_set_due_at()
returns trigger language plpgsql as $$
begin
  if NEW.due_at is null then
    NEW.due_at := coalesce(NEW.reported_at, now()) +
      case lower(coalesce(NEW.priority, 'normal'))
        when 'urgent' then interval '4 hours'   -- P1 (recepcja/React, triage LLM)
        when 'high'   then interval '4 hours'   -- P1 (alias z panel.html/addKonserwTask)
        when 'low'    then interval '72 hours'  -- P3
        else               interval '24 hours'  -- P2 (normal i nieznane)
      end;
  end if;
  if NEW.status = 'in_progress' and NEW.started_at is null then
    NEW.started_at := now();
  end if;
  if NEW.status = 'done' and NEW.completed_at is null then
    NEW.completed_at := coalesce(NEW.resolved_at, now());
  end if;
  return NEW;
end $$;

drop trigger if exists faults_set_due on public.faults;
create trigger faults_set_due
  before insert on public.faults
  for each row execute function public.faults_set_due_at();

-- 2) BEFORE UPDATE: rozszerzenie istniejącej funkcji niezmienności z 0004 o stemple czasu.
--    Zachowuje 1:1 dotychczasowe blokady (opis/zdjęcia/metadane) i walidację statusu, a dodatkowo:
--      - start naprawy (status → in_progress) stempluje started_at, jeśli puste,
--      - zamknięcie (status → done) stempluje completed_at (z resolved_at jeśli klient go ustawił).
--    started_at NIE jest uzupełniane przy bezpośrednim open → done, żeby nie zaniżać śr. czasu reakcji.
create or replace function public.faults_block_immutable()
returns trigger language plpgsql as $$
begin
  if NEW.id          <> OLD.id
     or NEW.tenant_id  is distinct from OLD.tenant_id
     or NEW.reported_at <> OLD.reported_at
     or NEW.source      is distinct from OLD.source
     or NEW.room        is distinct from OLD.room
     or NEW.description is distinct from OLD.description
     or NEW.photos      is distinct from OLD.photos
     or NEW.photo_url   is distinct from OLD.photo_url then
    raise exception 'Usterki są niezmienne — nie wolno zmieniać opisu/zdjęć/metadanych zgłoszenia.';
  end if;
  if NEW.status not in ('open','in_progress','done') then
    raise exception 'Nieprawidłowy status usterki: %', NEW.status;
  end if;

  -- Stemple czasu SLA (tylko gdy puste — nie nadpisujemy historii).
  if NEW.status = 'in_progress' and NEW.started_at is null then
    NEW.started_at := now();
  end if;
  if NEW.status = 'done' and NEW.completed_at is null then
    NEW.completed_at := coalesce(NEW.resolved_at, now());
  end if;

  NEW.updated_at := now();
  return NEW;
end $$;
-- Trigger faults_immutable z 0004 nadal wskazuje na tę funkcję — create or replace wystarcza.

-- 3) Uzupełnienie historycznych danych (jednorazowo): termin dla usterek bez due_at oraz
--    completed_at dla już zamkniętych, by dashboard SLA pokazał sensowne wartości od razu.
update public.faults
   set due_at = reported_at +
     case lower(coalesce(priority,'normal'))
       when 'urgent' then interval '4 hours'
       when 'high'   then interval '4 hours'
       when 'low'    then interval '72 hours'
       else               interval '24 hours'
     end
 where due_at is null and reported_at is not null;

update public.faults
   set completed_at = coalesce(resolved_at, updated_at)
 where status = 'done' and completed_at is null;

-- ========== 0044_faults_sla_escalation.sql ==========
-- 0044_faults_sla_escalation.sql  (Etap 3a — eskalacja przekroczonego SLA)
-- Gdy usterka przekroczy termin (due_at < now) i wciąż jest otwarta/w toku, raz tworzymy
-- AKTYWNY alert PILNY w manager_alerts (recepcja „Pilne" + ack przed zmianą, panel widzi),
-- po czym oznaczamy ją flagą escalated_at, żeby nie eskalować jej w kółko (bez spamu).
--
-- Bez sekretów i bez edycji Edge Functions — czysta logika w bazie + harmonogram pg_cron.
-- Push na telefon konserwatora to osobny krok 3b (pg_net/Vault lub Database Webhook).
-- Idempotentne.

-- 1) Flaga anty-spam: kiedy usterka została już zgłoszona jako po terminie.
alter table public.faults add column if not exists escalated_at timestamptz;

-- 2) Funkcja eskalacji — działa dla WSZYSTKICH tenantów (per-row tenant_id), zwraca liczbę
--    nowo zeskalowanych usterek. SECURITY DEFINER, bo uruchamia ją pg_cron (nie zalogowany user).
create or replace function public.escalate_overdue_faults()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with due as (
    select id, tenant_id,
           coalesce(nullif(room,''), nullif(space_id,''), '—') as loc,
           nullif(description,'')  as descr,
           nullif(assigned_to,'')  as who
    from public.faults
    where status in ('open','in_progress')
      and due_at is not null
      and due_at < now()
      and escalated_at is null
  ),
  ins as (
    insert into public.manager_alerts (tenant_id, title, body, priority, kind, created_by)
    select tenant_id,
           'SLA przekroczone: ' || loc,
           'Usterka po terminie naprawy'
             || coalesce(' — ' || descr, '')
             || coalesce(' · przypisana: ' || who, ' · nieprzypisana'),
           'high', 'alert', 'System SLA'
    from due
    returning 1
  )
  update public.faults f
     set escalated_at = now()
    from due
   where f.id = due.id;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 3) Harmonogram: pg_cron co 15 min. Na Supabase pg_cron bywa włączany w Dashboard →
--    Database → Extensions; poniższe próbuje go włączyć i re-rejestruje zadanie idempotentnie.
do $$
begin
  -- Włącz rozszerzenie, jeśli dostępne (gdy brak uprawnień — włącz ręcznie w Dashboard).
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron: nie udało się utworzyć rozszerzenia tutaj — włącz je w Dashboard, potem uruchom samą sekcję cron.schedule.';
  end;

  -- Re-rejestracja zadania (usuń stare o tej nazwie, dodaj świeże).
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job where jobname = 'escalate-overdue-faults';
    perform cron.schedule(
      'escalate-overdue-faults',
      '*/15 * * * *',
      $cron$ select public.escalate_overdue_faults(); $cron$
    );
  end if;
end $$;

-- ========== 0045_sla_config_per_tenant.sql ==========
-- 0045_sla_config_per_tenant.sql  (Etap 4 — progi SLA konfigurowalne per tenant)
-- Dotąd progi terminu (P1=4h, P2=24h, P3=72h) były zaszyte w triggerze faults_set_due_at (0043).
-- Pod SaaS każdy obiekt (tenant) może mieć własne progi. Trigger czyta je z public.sla_config,
-- a gdy tenant nie ma wiersza — używa wartości domyślnych (zachowanie jak w 0043).
-- Idempotentne.

-- 1) Tabela konfiguracji progów SLA per tenant.
create table if not exists public.sla_config (
  tenant_id    uuid primary key,
  urgent_hours numeric not null default 4,   -- P1 (urgent/high)
  normal_hours numeric not null default 24,  -- P2 (normal)
  low_hours    numeric not null default 72,  -- P3 (low)
  updated_at   timestamptz not null default now()
);

alter table public.sla_config enable row level security;

-- Odczyt: dla aplikacji (anon) i panelu (authenticated). Zmiana progów: tylko zalogowany z rolą.
drop policy if exists "sla_config_read"        on public.sla_config;
drop policy if exists "sla_config_auth_write"  on public.sla_config;
drop policy if exists "sla_config_auth_update" on public.sla_config;
create policy "sla_config_read"        on public.sla_config for select using (true);
create policy "sla_config_auth_write"  on public.sla_config for insert to authenticated
  with check ( public.current_app_role() is not null );
create policy "sla_config_auth_update" on public.sla_config for update to authenticated
  using ( public.current_app_role() is not null ) with check ( public.current_app_role() is not null );

-- 2) Domyślny wiersz dla obecnego tenanta (Conrad Comfort). Nie nadpisuje, jeśli już jest.
insert into public.sla_config (tenant_id)
  values ('00000000-0000-0000-0000-000000000001')
  on conflict (tenant_id) do nothing;

-- 3) Trigger terminu czyta progi z sla_config (fallback na domyślne, gdy brak wiersza tenanta).
create or replace function public.faults_set_due_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.sla_config%rowtype;
  h   numeric;
begin
  if NEW.due_at is null then
    select * into cfg from public.sla_config where tenant_id = NEW.tenant_id;
    h := case lower(coalesce(NEW.priority, 'normal'))
           when 'urgent' then coalesce(cfg.urgent_hours, 4)
           when 'high'   then coalesce(cfg.urgent_hours, 4)
           when 'low'    then coalesce(cfg.low_hours, 72)
           else               coalesce(cfg.normal_hours, 24)
         end;
    NEW.due_at := coalesce(NEW.reported_at, now()) + make_interval(mins => round(h * 60)::int);
  end if;
  if NEW.status = 'in_progress' and NEW.started_at is null then
    NEW.started_at := now();
  end if;
  if NEW.status = 'done' and NEW.completed_at is null then
    NEW.completed_at := coalesce(NEW.resolved_at, now());
  end if;
  return NEW;
end $$;
-- Trigger faults_set_due (BEFORE INSERT) z 0043 nadal wskazuje na tę funkcję — wystarcza replace.

-- ========== 0046_error_logs.sql ==========
-- 0046_error_logs.sql
-- Przenumerowane z 0013 (kolizja numeru, WYKONANIE 1.2). Na żywej bazie było
-- już zastosowane jako 0013; idempotentne (create ... if not exists), więc
-- ponowne `db push` jest bezpieczne. Zależności: brak (tabela liściowa).
-- Cichy rejestr błędów runtime panelu recepcji (ErrorBoundary + globalne
-- window.onerror / unhandledrejection). Cel: rano widać crash z nocnej zmiany
-- bez telefonu od recepcji. Zapis best-effort, błąd insertu nie może zepsuć UI.

create table if not exists public.error_logs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  created_at      timestamptz not null default now(),
  severity        text not null default 'error',   -- 'fatal' | 'error'
  message         text,
  stack           text,
  component_stack text,
  source          text,                            -- 'boundary' | 'window' | 'promise'
  url             text,
  user_agent      text,
  app_version     text,
  context         jsonb
);

create index if not exists error_logs_tenant_day_idx
  on public.error_logs (tenant_id, created_at desc);

alter table public.error_logs enable row level security;

-- Zapis: anon INSERT (panel działa na anon key). Brak DELETE (trwały ślad).
drop policy if exists "error_logs_anon_insert" on public.error_logs;
create policy "error_logs_anon_insert"
  on public.error_logs for insert to anon
  with check (true);

-- Odczyt: anon SELECT (panel admina może wyświetlić ostatnie błędy).
drop policy if exists "error_logs_anon_read" on public.error_logs;
create policy "error_logs_anon_read"
  on public.error_logs for select to anon
  using (true);

-- ========== 0047_correction_approvals.sql ==========
-- 0047_correction_approvals.sql
-- Przenumerowane z 0030 (kolizja numeru, WYKONANIE 1.2). Idempotentne
-- (create table if not exists). Zależności: brak (tabela liściowa).
-- Zatwierdzanie korekt płatności z panelu menedżerskiego.
-- Korekty są zapisywane jednokierunkowo (recepcja -> panel_mirror, read-only snapshot),
-- więc decyzję kierownika trzymamy w osobnej tabeli, żeby nie nadpisywać lustra recepcji.
-- Panel zapisuje i odczytuje zatwierdzenia; aplikacja recepcji może je odczytać w przyszłości.

create table if not exists public.payment_correction_approvals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  correction_id  text not null,          -- id korekty z aplikacji recepcji (crypto.randomUUID)
  decision       text not null default 'approved',  -- approved | rejected
  manager        text,                   -- imię kierownika podejmującego decyzję
  note           text,                   -- opcjonalny komentarz
  decided_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (tenant_id, correction_id)
);

create index if not exists correction_approvals_tenant_idx
  on public.payment_correction_approvals (tenant_id, decided_at desc);

alter table public.payment_correction_approvals enable row level security;

drop policy if exists "corr_appr_anon_read"   on public.payment_correction_approvals;
drop policy if exists "corr_appr_anon_insert" on public.payment_correction_approvals;
drop policy if exists "corr_appr_anon_update" on public.payment_correction_approvals;
create policy "corr_appr_anon_read"   on public.payment_correction_approvals for select to anon using (true);
create policy "corr_appr_anon_insert" on public.payment_correction_approvals for insert to anon with check (true);
create policy "corr_appr_anon_update" on public.payment_correction_approvals for update to anon using (true) with check (true);

-- ========== 0048_grafik_dept_visibility.sql ==========
-- 0048_grafik_dept_visibility.sql
-- Przenumerowane z 0036 (kolizja numeru, WYKONANIE 1.2). To OSTATNIA definicja
-- list_availability_requests() (nic po niej jej nie nadpisuje), a zależy tylko od
-- obiektów tworzonych wcześniej — bezpiecznie na końcu. Idempotentne (drop+create).
-- KORELACJA DZIAŁU dla zbiórek dyspozycyjności (zakładka „Grafik" w panelu).
-- Dotąd `list_availability_requests` zwracała wszystkie prośby, a panel filtrował
-- je po imieniu twórcy (created_by === zalogowany) — przez co koordynator i
-- menedżer recepcji NIE widzieli nawzajem swoich grafików, mimo że obsługują ten
-- sam dział (recepcja). Teraz RPC zwraca też `kind` prośby (dział: 'hk' |
-- 'recepcja'), wyznaczony z tokenów (wszystkie tokeny jednej prośby mają jeden
-- kind). Panel filtruje po DZIALE roli, więc cały dział recepcji (koordynator +
-- menedżer recepcji + gł./oper.) widzi wspólną pulę grafików recepcji, a menedżer
-- HK — grafiki HK. Usuwanie pozostaje przy właścicielu (migracja 0026).
--
-- Bez zmiany schematu tabel — tylko sygnatura funkcji zyskuje kolumnę `kind`.

drop function if exists public.list_availability_requests();
create function public.list_availability_requests()
returns table(id uuid, period_type text, period_start date, created_by text,
              created_at timestamptz, expires_at timestamptz, kind text,
              persons bigint, answered bigint)
language sql stable security definer set search_path = public as $$
  select r.id, r.period_type, r.period_start, r.created_by, r.created_at, r.expires_at,
         (select max(t.kind) from public.availability_tokens t where t.request_id = r.id) as kind,
         (select count(*) from public.availability_tokens t where t.request_id = r.id) as persons,
         (select count(distinct e.token) from public.availability_entries e
            join public.availability_tokens t on t.token = e.token where t.request_id = r.id) as answered
  from public.availability_requests r
  where public.current_app_role() is not null
  order by r.created_at desc limit 50;
$$;
grant execute on function public.list_availability_requests() to authenticated;

-- ========== 0049_tenants.sql ==========
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

-- ========== 0050_role_owner.sql ==========
-- 0050_role_owner.sql  (ETAP 2 — domknięcie modelu ról o `owner`)
-- WYKONANIE 2.13. Rejestr ról (app_accounts.role + funkcje admin_*) zyskuje rolę
-- `owner` (właściciel) — pod read-only panel właściciela (4.10) i wspólny model ról
-- (2.16-2.18). Pozostałe role mgr_* bez zmian. Idempotentne.

-- ── 1) Ograniczenie kolumny role: dołóż 'owner' ──────────────────────────────
alter table public.app_accounts drop constraint if exists app_accounts_role_check;
alter table public.app_accounts add constraint app_accounts_role_check
  check (role in ('owner','admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro'));

-- ── 2) admin_add_account: pozwól tworzyć konto owner (kopia 0016 + 'owner') ───
create or replace function public.admin_add_account(p_name text, p_role text, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text; v_has_code boolean;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  if p_role not in ('owner','admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
    then raise exception 'Zła rola.'; end if;
  v_has_code := coalesce(trim(p_code),'') <> '';
  v_email := 'acc_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10) || '@conrad-panel.com';
  insert into public.app_accounts(tenant_id, name, email, role, requires_code, claim_code_hash)
    values ('00000000-0000-0000-0000-000000000001', trim(p_name), v_email, p_role,
            v_has_code, case when v_has_code then md5(trim(p_code)) else null end);
  perform public.log_action('konto_dodane',
    format('%s (%s)%s', trim(p_name), p_role, case when v_has_code then ' + kod' else '' end), null);
  return v_email;
end $$;
grant execute on function public.admin_add_account(text, text, text) to authenticated;

-- ── 3) admin_set_role: pozwól ustawić rolę owner (kopia 0015 + 'owner') ───────
create or replace function public.admin_set_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if p_role not in ('owner','admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
    then raise exception 'Zła rola.'; end if;
  update public.app_accounts set role = p_role where email = p_email;
  perform public.log_action('konto_rola', format('%s → %s', p_email, p_role), null);
end $$;
grant execute on function public.admin_set_role(text, text) to authenticated;

-- ========== 0051_tenant_settings.sql ==========
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

-- ========== 0052_panel_onboarding.sql ==========
-- 0052_panel_onboarding.sql  (WYKONANIE 4.25 — onboarding pracownika)
-- Tura pierwszego logowania: flaga onboarded_at PER KONTO (nie localStorage —
-- pracownik loguje się z różnych telefonów, flaga musi iść z kontem, nie z urządzeniem).
-- Idempotentne.

alter table public.app_accounts add column if not exists onboarded_at timestamptz;

-- Woła to zalogowane konto samo o sobie, po zamknięciu/pominięciu tury —
-- zwykły authenticated wystarczy (analogicznie do innych *_set_* na własne konto).
create or replace function public.mark_onboarded()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.app_accounts
     set onboarded_at = now()
   where email = public.current_app_email()
     and onboarded_at is null;
end $$;
grant execute on function public.mark_onboarded() to authenticated;

-- ========== 0053_whatsapp_bot.sql ==========
-- 0053_whatsapp_bot.sql  (WYKONANIE 4.24 — bot WhatsApp: wysyłka linku do grafiku)
-- Kolejka wysyłek + kontakty pracowników. Numer telefonu SZYFROWANY (pgcrypto),
-- NIE hashowany — hash byłby bezużyteczny, bot musi znać prawdziwy numer żeby
-- wysłać wiadomość. Klucz szyfrujący istnieje TYLKO jako ustawienie bazy danych
-- (nigdy w kliencie/repo), więc nawet wyciek kodu aplikacji (patrz incydent
-- .env w instalatorach) nie odsłania numerów.
--
-- WYMAGANY RĘCZNY KROK PO TWOJEJ STRONIE (raz, w Supabase SQL editor — NIE tutaj,
-- bo ten plik trafia do repo/gita i sekret nie może w nim być):
--   alter database postgres set app.whatsapp_key = '<długi-losowy-sekret>';
-- Wygeneruj sekret np. `openssl rand -hex 32`. Bez tego kroku set_employee_phone
-- i decrypt_employee_phones rzucą błąd (current_setting bez `true` = wyjątek,
-- celowo — nie chcemy cichego szyfrowania pustym/domyślnym kluczem).
--
-- Idempotentne.

-- Supabase instaluje pgcrypto domyślnie do schematu `extensions`, nie `public` —
-- funkcje poniżej muszą mieć `extensions` w search_path, inaczej pgp_sym_encrypt/
-- pgp_sym_decrypt "nie istnieją" mimo że rozszerzenie jest włączone.
create extension if not exists pgcrypto with schema extensions;

-- ─── Kontakty pracowników (numer telefonu WhatsApp, per tenant+imię) ──────────
create table if not exists public.employee_contacts (
  tenant_id  uuid not null,
  name       text not null,
  phone_enc  bytea,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, name)
);
alter table public.employee_contacts enable row level security;
-- Celowo ZERO polityk SELECT/UPDATE dla anon/authenticated (wzorzec availability_*
-- z 0012) — zapis wyłącznie przez set_employee_phone (poniżej), odczyt treści
-- (odszyfrowanie) wyłącznie przez decrypt_employee_phones ograniczone do service_role.

-- Manager wpisuje/aktualizuje numer pracownika. Nie zwraca numeru z powrotem.
create or replace function public.set_employee_phone(p_tenant_id uuid, p_name text, p_phone text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  insert into public.employee_contacts(tenant_id, name, phone_enc, updated_at)
    values (p_tenant_id, trim(p_name),
            case when coalesce(trim(p_phone),'') = '' then null
                 else pgp_sym_encrypt(trim(p_phone), current_setting('app.whatsapp_key')) end,
            now())
    on conflict (tenant_id, name) do update
      set phone_enc = excluded.phone_enc, updated_at = now();
end $$;
grant execute on function public.set_employee_phone(uuid, text, text) to authenticated;

-- Manager widzi tylko CZY numer jest ustawiony (bool) — nigdy treść, nawet zaszyfrowaną.
create or replace function public.list_employee_phone_status(p_tenant_id uuid)
returns table(name text, has_phone boolean)
language sql stable security definer set search_path = public as $$
  select name, (phone_enc is not null) as has_phone
  from public.employee_contacts
  where tenant_id = p_tenant_id and public.current_app_role() is not null;
$$;
grant execute on function public.list_employee_phone_status(uuid) to authenticated;

-- Odszyfrowanie — WYŁĄCZNIE dla serwisu bota (klucz service_role, jak push-send).
-- Jawnie odbieramy domyślny grant PUBLIC, żeby nikt inny (anon/authenticated)
-- nie mógł tego wywołać, nawet gdyby ktoś zgadł nazwę funkcji.
create or replace function public.decrypt_employee_phones(p_tenant_id uuid)
returns table(name text, phone text)
language sql stable security definer set search_path = public, extensions as $$
  select name, pgp_sym_decrypt(phone_enc, current_setting('app.whatsapp_key'))
  from public.employee_contacts
  where tenant_id = p_tenant_id and phone_enc is not null;
$$;
revoke all on function public.decrypt_employee_phones(uuid) from public;
grant execute on function public.decrypt_employee_phones(uuid) to service_role;

-- ─── Kolejka wysyłek WhatsApp (jedna pozycja per pracownik przy generowaniu grafiku) ─
create table if not exists public.whatsapp_send_queue (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  person     text not null,
  token      text not null,
  expires_at timestamptz,
  status     text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error      text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists whatsapp_send_queue_pending_idx
  on public.whatsapp_send_queue(status, created_at) where status = 'pending';
alter table public.whatsapp_send_queue enable row level security;
-- Celowo ZERO polityk dla anon/authenticated (zapis przez RPC, odczyt/aktualizacja
-- kolejki wyłącznie przez bota kluczem service_role — bypass RLS, wzorzec push-send).

create or replace function public.queue_whatsapp_sends(p_tenant_id uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_row jsonb; v_n int := 0;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into public.whatsapp_send_queue(tenant_id, person, token, expires_at)
      values (p_tenant_id, v_row->>'person', v_row->>'token', nullif(v_row->>'expires_at','')::timestamptz);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.queue_whatsapp_sends(uuid, jsonb) to authenticated;

-- ========== 0054_page_access_tokens.sql ==========
-- 0054_page_access_tokens.sql
-- Bramka dostępu do stron telefonu bez logowania, otwieranych przez zapisany
-- link (wyjazdy.html) — dotąd bez żadnego tokena: każdy, kto poznał adres URL,
-- widział realne dane wyjazdów gości. Ten sam wzorzec bezpieczeństwa co
-- availability_tokens (migracja 0012): RLS włączony, ZERO polityk → dostęp
-- wyłącznie przez funkcję SECURITY DEFINER poniżej.

create table if not exists public.page_access_tokens (
  token      text primary key,
  tenant_id  uuid not null,
  page       text not null,        -- np. 'wyjazdy' — rozszerzalne na kolejne bez-loginowe strony
  label      text,                 -- kto/co dostał link, np. "Menedżer HK"
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.page_access_tokens enable row level security;
-- celowo BRAK polityk — dostęp tylko przez funkcję poniżej (jak availability_tokens).

create or replace function public.check_page_token(p_token text, p_page text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.page_access_tokens
    where token = p_token and page = p_page and active
  );
$$;
grant execute on function public.check_page_token(text, text) to anon, authenticated;

-- Token startowy dla istniejącego zapisanego linku „Wyjazdy" (menedżer HK) —
-- stary link bez ?t= przestaje działać, ten nowy trzeba zapisać w jego miejsce.
insert into public.page_access_tokens (token, tenant_id, page, label)
values ('C59313', '00000000-0000-0000-0000-000000000001', 'wyjazdy', 'Menedżer HK')
on conflict (token) do nothing;

-- ========== 0055_own_rates.sql ==========
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

-- ========== 0056_superadmin_tenants.sql ==========
-- 0056_superadmin_tenants.sql  (kokpit właściciela SaaS — lista hoteli, płatności, kill-switch)
-- Do tej pory `tenants` (0049) miał write-policy otwartą dla KAŻDEJ zalogowanej
-- roli (current_app_role() is not null) — bezpieczne dopóki nikt tego nie używał,
-- ale teraz dodajemy realny kill-switch, więc zawężamy zapis do nowej roli
-- `superadmin` (operator SaaS, NIE hotel). Odczyt zostaje otwarty (potrzebny do
-- rozwiązania brandingu w runtime, 2.7).
-- Numer WhatsApp per hotel = decyzja usera (osobny numer/telefon per hotel,
-- nie jeden wspólny bot) — czysto informacyjna etykieta w tenants, bot serwisem
-- utrzymuje osobną sesję Baileys per tenant_id (patrz scripts/whatsapp-bot/bot.mjs).
-- Idempotentne.

alter table public.app_accounts drop constraint if exists app_accounts_role_check;
alter table public.app_accounts add constraint app_accounts_role_check
  check (role in ('superadmin','owner','admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro'));

alter table public.tenants add column if not exists whatsapp_number text;

-- ─── Zawężenie zapisu do tenants — tylko superadmin ───────────────────────────
drop policy if exists "tenants_auth_write" on public.tenants;
drop policy if exists "tenants_auth_upd"   on public.tenants;
create policy "tenants_auth_write" on public.tenants for insert to authenticated
  with check ( public.current_app_role() = 'superadmin' );
create policy "tenants_auth_upd"   on public.tenants for update to authenticated
  using ( public.current_app_role() = 'superadmin' ) with check ( public.current_app_role() = 'superadmin' );

-- ─── RPC: lista hoteli (nazwa, status, plan, opłacone do, numer WhatsApp) ─────
create or replace function public.superadmin_list_tenants()
returns table(id uuid, name text, slug text, status text, plan text,
              trial_ends_at timestamptz, whatsapp_number text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, name, slug, status, plan, trial_ends_at, whatsapp_number, created_at
  from public.tenants
  where public.current_app_role() = 'superadmin'
  order by created_at desc;
$$;
grant execute on function public.superadmin_list_tenants() to authenticated;

-- ─── RPC: kill-switch / zmiana statusu (trial|active|suspended) ──────────────
create or replace function public.superadmin_set_tenant_status(p_tenant_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'superadmin' then raise exception 'Tylko superadmin.'; end if;
  if p_status not in ('trial','active','suspended') then raise exception 'Zły status.'; end if;
  update public.tenants set status = p_status where id = p_tenant_id;
end $$;
grant execute on function public.superadmin_set_tenant_status(uuid, text) to authenticated;

-- ─── RPC: ustaw datę końca próby/opłacenia ────────────────────────────────────
create or replace function public.superadmin_set_tenant_trial_ends(p_tenant_id uuid, p_trial_ends_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'superadmin' then raise exception 'Tylko superadmin.'; end if;
  update public.tenants set trial_ends_at = p_trial_ends_at where id = p_tenant_id;
end $$;
grant execute on function public.superadmin_set_tenant_trial_ends(uuid, timestamptz) to authenticated;

-- ─── RPC: numer WhatsApp przypisany do hotelu (etykieta, nie sekret) ─────────
create or replace function public.superadmin_set_tenant_whatsapp(p_tenant_id uuid, p_number text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'superadmin' then raise exception 'Tylko superadmin.'; end if;
  update public.tenants set whatsapp_number = nullif(trim(p_number),'') where id = p_tenant_id;
end $$;
grant execute on function public.superadmin_set_tenant_whatsapp(uuid, text) to authenticated;

-- ─── RPC: nowy hotel (imię + slug; reszta — moduły/branding — osobno, 4.13) ──
create or replace function public.superadmin_create_tenant(p_name text, p_slug text, p_plan text default 'start')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.current_app_role() <> 'superadmin' then raise exception 'Tylko superadmin.'; end if;
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_slug),'') = '' then raise exception 'Brak nazwy/sluga.'; end if;
  insert into public.tenants(name, slug, status, plan, trial_ends_at)
    values (trim(p_name), trim(p_slug), 'trial', coalesce(nullif(trim(p_plan),''),'start'), now() + interval '7 days')
    returning id into v_id;
  return v_id;
end $$;
grant execute on function public.superadmin_create_tenant(text, text, text) to authenticated;

-- ========== 0057_schedules_rls.sql ==========
-- 0057_schedules_rls.sql
-- `public.schedules` (0033_grafik_schedule.sql) powstała bez RLS — złapane przez
-- linter Supabase przy wklejaniu panel_install.sql: "Clients using anon or
-- authenticated keys may be able to access public.schedules". Cały kod appki
-- czyta/pisze ten grafik WYŁĄCZNIE przez get_schedule/save_schedule (SECURITY
-- DEFINER) — brak jakiegokolwiek bezpośredniego `.from("schedules")` w src/panel.
-- Włączenie RLS bez żadnej polityki (jak availability_requests/whatsapp_send_queue)
-- jest więc bezpieczne i niczego nie zrywa. Idempotentne.

alter table public.schedules enable row level security;

-- ========== 0059_hk_check_plans.sql ==========
-- 0059_hk_check_plans.sql
-- Plan kontroli HK: menedżer/kierownik tworzy zadanie kontrolne przypięte do POKOJU
-- (np. "sprawdź stan silikonów"), nie do osoby — realizuje je ktokolwiek akurat
-- sprząta ten pokój danego dnia (przydział z hk_plan.assignments). Jeśli dana
-- pokojówka nie ma tego pokoju, zadanie NIE znika — czeka aż ktoś go dostanie.
--
-- Reguła "final wygrywa": rano oznaczenie "wykonane" zamyka zadanie na stałe
-- (is_final=true); popołudnie może wtedy tylko przeglądać, nigdy nadpisać. Jeśli
-- rano nikt nie sprawdził, popołudnie może zgłosić WYŁĄCZNIE "nie udało się
-- sprawdzić" z powodem (np. "gość poprosił o niewchodzenie") — nie może samo
-- oznaczyć "wykonane" (to zastrzeżone dla zmiany porannej wg wymagań menedżera).
-- Egzekwowane atomowo w hk_check_submit (RPC), nie w kliencie — eliminuje wyścig
-- dwóch osób klikających jednocześnie.

create table if not exists public.hk_check_plans (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  name       text not null,
  task       text not null,
  status     text not null default 'active',  -- active | done
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hk_check_plans_tenant_idx
  on public.hk_check_plans(tenant_id, status, created_at desc);

create table if not exists public.hk_check_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default '00000000-0000-0000-0000-000000000001',
  plan_id      uuid not null references public.hk_check_plans(id) on delete cascade,
  room         text not null,
  valid_from   date not null,
  valid_to     date not null,
  status       text not null default 'pending',  -- pending | done | failed
  result_shift text,                              -- 'morning' | 'pm' — kto ostatnio zgłosił wynik
  done_by      text,
  done_at      timestamptz,
  fail_reason  text,
  is_final     boolean not null default false,    -- true = zamknięte na stałe, kolejne zmiany nie mogą nadpisać
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists hk_check_items_plan_idx on public.hk_check_items(plan_id);
create index if not exists hk_check_items_room_idx
  on public.hk_check_items(tenant_id, room, valid_from, valid_to);

alter table public.hk_check_plans enable row level security;
drop policy if exists "hk_check_plans_anon" on public.hk_check_plans;
drop policy if exists "hk_check_plans_auth" on public.hk_check_plans;
create policy "hk_check_plans_anon" on public.hk_check_plans for all to anon using (true) with check (true);
create policy "hk_check_plans_auth" on public.hk_check_plans for all to authenticated using (true) with check (true);

alter table public.hk_check_items enable row level security;
drop policy if exists "hk_check_items_anon" on public.hk_check_items;
drop policy if exists "hk_check_items_auth" on public.hk_check_items;
create policy "hk_check_items_anon" on public.hk_check_items for all to anon using (true) with check (true);
create policy "hk_check_items_auth" on public.hk_check_items for all to authenticated using (true) with check (true);

-- ── Zgłoszenie wyniku kontroli — atomowe, egzekwuje regułę "final wygrywa" ───
-- Wywołanie: supabase.rpc('hk_check_submit', { p_item_id, p_shift, p_result, p_reason, p_worker })
--   p_shift  'morning' | 'pm'
--   p_result 'done' | 'failed' (popołudnie: tylko 'failed' jest dozwolone)
drop function if exists public.hk_check_submit(uuid, text, text, text, text);
create or replace function public.hk_check_submit(
  p_item_id uuid,
  p_shift   text,
  p_result  text,
  p_reason  text default null,
  p_worker  text default null
) returns public.hk_check_items
language plpgsql security definer set search_path = public as $$
declare r public.hk_check_items;
begin
  select * into r from public.hk_check_items where id = p_item_id for update;
  if not found then
    raise exception 'hk_check_items % not found', p_item_id;
  end if;
  if r.is_final then
    return r; -- już zamknięte (rano) — kolejne próby (popołudnie) nic nie zmieniają
  end if;
  if p_shift = 'pm' and p_result = 'done' then
    raise exception 'Zmiana popołudniowa nie może oznaczyć zadania jako wykonane od nowa';
  end if;
  update public.hk_check_items set
    status       = p_result,
    result_shift = p_shift,
    done_by      = p_worker,
    done_at      = now(),
    fail_reason  = case when p_result = 'failed' then p_reason else null end,
    is_final     = (p_shift = 'morning' and p_result = 'done'),
    updated_at   = now()
  where id = p_item_id
  returning * into r;
  return r;
end $$;

grant execute on function public.hk_check_submit(uuid, text, text, text, text) to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='hk_check_plans') then
    alter publication supabase_realtime add table public.hk_check_plans;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='hk_check_items') then
    alter publication supabase_realtime add table public.hk_check_items;
  end if;
end $$;

-- ========== 0060_shop_sklepik.sql ==========
-- 0060_shop_sklepik.sql
-- Sklepik recepcji jako MAGAZYN (WYKONANIE 4.2, rozszerzone o wymaganie usera:
-- prawdziwy stan/wydania, nie tylko log sprzedaży). Trzy tabele:
--   shop_items     — katalog: nazwa, cena sprzedaży, stan bieżący (stock)
--   shop_sales     — wydania gościom (kasjer/recepcja) — ujemne qty = storno
--   shop_purchases — przyjęcia towaru ("Zakupy") — wyłącznie menedżer po
--                    stronie UI (isAdmin), tu bez osobnej roli DB (ten sam
--                    model co reszta funkcji admina w tej appce — PIN menedżera)
--
-- Stock jest MUTOWANY wyłącznie przez RPC (shop_sell/shop_storno/shop_purchase),
-- z blokadą wiersza (for update), żeby dwie jednoczesne sprzedaże nie przesprzedały
-- towaru. Utarg to osobny log (shop_sales) — zero zmian w calculateShiftCash,
-- wzorem już wdrożonych 4.1 (safe_operations) i 4.12 (upsell_charges).

create table if not exists public.shop_items (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  name       text not null,
  price      numeric(10,2) not null default 0,
  stock      integer not null default 0,
  min_stock  integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_items_tenant_idx on public.shop_items(tenant_id, active, name);

create table if not exists public.shop_sales (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  item_id    uuid not null references public.shop_items(id),
  name       text not null,              -- denormalizowana nazwa (historia niezależna od zmian w katalogu)
  qty        integer not null,           -- ujemne = storno
  unit_price numeric(10,2) not null,
  total      numeric(10,2) not null,
  payment    text not null default 'gotowka', -- gotowka | karta
  shift      text,
  by         text,
  created_at timestamptz not null default now()
);
create index if not exists shop_sales_tenant_idx on public.shop_sales(tenant_id, created_at desc);

create table if not exists public.shop_purchases (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  item_id    uuid not null references public.shop_items(id),
  name       text not null,
  qty        integer not null,
  unit_cost  numeric(10,2),
  by         text,
  created_at timestamptz not null default now()
);
create index if not exists shop_purchases_tenant_idx on public.shop_purchases(tenant_id, created_at desc);

alter table public.shop_items enable row level security;
drop policy if exists "shop_items_anon" on public.shop_items;
drop policy if exists "shop_items_auth" on public.shop_items;
create policy "shop_items_anon" on public.shop_items for all to anon using (true) with check (true);
create policy "shop_items_auth" on public.shop_items for all to authenticated using (true) with check (true);

alter table public.shop_sales enable row level security;
drop policy if exists "shop_sales_anon" on public.shop_sales;
drop policy if exists "shop_sales_auth" on public.shop_sales;
create policy "shop_sales_anon" on public.shop_sales for all to anon using (true) with check (true);
create policy "shop_sales_auth" on public.shop_sales for all to authenticated using (true) with check (true);

alter table public.shop_purchases enable row level security;
drop policy if exists "shop_purchases_anon" on public.shop_purchases;
drop policy if exists "shop_purchases_auth" on public.shop_purchases;
create policy "shop_purchases_anon" on public.shop_purchases for all to anon using (true) with check (true);
create policy "shop_purchases_auth" on public.shop_purchases for all to authenticated using (true) with check (true);

-- ── Sprzedaż: blokada wiersza + sprawdzenie stanu, żeby nie przesprzedać ─────
drop function if exists public.shop_sell(uuid, integer, text, text, text);
create or replace function public.shop_sell(
  p_item_id uuid,
  p_qty     integer,
  p_payment text default 'gotowka',
  p_shift   text default null,
  p_by      text default null
) returns public.shop_sales
language plpgsql security definer set search_path = public as $$
declare it public.shop_items; s public.shop_sales;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Ilość musi być dodatnia';
  end if;
  select * into it from public.shop_items where id = p_item_id for update;
  if not found then raise exception 'Produkt nie istnieje'; end if;
  if it.stock < p_qty then raise exception 'Za mało na stanie (dostępne: %)', it.stock; end if;
  update public.shop_items set stock = stock - p_qty, updated_at = now() where id = p_item_id;
  insert into public.shop_sales(tenant_id, item_id, name, qty, unit_price, total, payment, shift, by)
    values (it.tenant_id, it.id, it.name, p_qty, it.price, it.price * p_qty, coalesce(p_payment,'gotowka'), p_shift, p_by)
    returning * into s;
  return s;
end $$;
grant execute on function public.shop_sell(uuid, integer, text, text, text) to anon, authenticated;

-- ── Storno: przywraca stan, dopisuje wiersz ujemny (nigdy nie edytuje oryginału,
-- żeby raport z danego dnia zawsze odtwarzał się identycznie) ───────────────
drop function if exists public.shop_storno(uuid, text);
create or replace function public.shop_storno(
  p_sale_id uuid,
  p_by      text default null
) returns public.shop_sales
language plpgsql security definer set search_path = public as $$
declare orig public.shop_sales; s public.shop_sales;
begin
  select * into orig from public.shop_sales where id = p_sale_id for update;
  if not found then raise exception 'Sprzedaż nie istnieje'; end if;
  if orig.qty < 0 then raise exception 'To już jest storno'; end if;
  update public.shop_items set stock = stock + orig.qty, updated_at = now() where id = orig.item_id;
  insert into public.shop_sales(tenant_id, item_id, name, qty, unit_price, total, payment, shift, by)
    values (orig.tenant_id, orig.item_id, orig.name, -orig.qty, orig.unit_price, -orig.total, orig.payment, orig.shift, p_by)
    returning * into s;
  return s;
end $$;
grant execute on function public.shop_storno(uuid, text) to anon, authenticated;

-- ── Zakupy (Zakupy = wyłącznie menedżer, egzekwowane w UI): przyjęcie towaru,
-- podbija stan magazynowy. Osobny log od sprzedaży (koszt vs cena sprzedaży). ─
drop function if exists public.shop_purchase(uuid, integer, numeric, text);
create or replace function public.shop_purchase(
  p_item_id   uuid,
  p_qty       integer,
  p_unit_cost numeric default null,
  p_by        text default null
) returns public.shop_purchases
language plpgsql security definer set search_path = public as $$
declare it public.shop_items; pr public.shop_purchases;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Ilość musi być dodatnia';
  end if;
  select * into it from public.shop_items where id = p_item_id for update;
  if not found then raise exception 'Produkt nie istnieje'; end if;
  update public.shop_items set stock = stock + p_qty, updated_at = now() where id = p_item_id;
  insert into public.shop_purchases(tenant_id, item_id, name, qty, unit_cost, by)
    values (it.tenant_id, it.id, it.name, p_qty, p_unit_cost, p_by)
    returning * into pr;
  return pr;
end $$;
grant execute on function public.shop_purchase(uuid, integer, numeric, text) to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shop_items') then
    alter publication supabase_realtime add table public.shop_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shop_sales') then
    alter publication supabase_realtime add table public.shop_sales;
  end if;
end $$;

-- ========== 0061_meal_plan.sql ==========
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

-- ========== 0062_meal_plan_groups.sql ==========
-- Rezerwacje grupowe w raporcie "Posiłki" nie mają numeru pokoju (raport zwraca
-- jeden zbiorczy wiersz na całą grupę, nr pok.=-1) — wcześniej były pomijane,
-- co zaniżało liczby o połowę i więcej. Teraz zapisywane jako osobna pozycja
-- oznaczona is_group, żeby UI mogło pokazać inny styl kafla i większy krok.
alter table public.meal_plans add column if not exists is_group boolean not null default false;

-- ========== seed_app_accounts.sql ==========
-- seed_app_accounts.sql
-- Wstępny spis 7 kont panelu menedżerskiego. Imiona możesz dowolnie zmienić (kolumna name).
-- Email to ukryty login — nie musi istnieć fizycznie (potwierdzanie maila WYŁĄCZONE w Auth).
-- Konta są nieprzejęte (claimed=false): przy 1. logowaniu osoba ustawia swoje hasło.
-- Uruchom PO migracji 0010. Bezpieczne do ponownego puszczenia (ON CONFLICT DO NOTHING).

insert into public.app_accounts (tenant_id, name, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Admin',                'admin@conrad-panel.com',      'admin'),
  ('00000000-0000-0000-0000-000000000001', 'Koordynator',          'koordynator@conrad-panel.com','koordynator'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer recepcji',    'recepcja@conrad-panel.com',   'mgr_recepcja'),
  ('00000000-0000-0000-0000-000000000001', 'Tetiana (HK)',         'tetiana@conrad-panel.com',    'mgr_hk'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer główny',      'glowny@conrad-panel.com',     'mgr_glowny'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer operacyjny',  'operacyjny@conrad-panel.com', 'mgr_operacyjny'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer gastronomii', 'gastro@conrad-panel.com',     'mgr_gastro')
on conflict (email) do nothing;

-- ========== 0064_schedule_excluded.sql ==========
-- 0064_schedule_excluded.sql
-- FIX: "Ułóż grafik" nie pozwalał trwale usunąć osoby z tabeli — schedRemovePerson
--   usuwał ją tylko z pamięci sesji, a openSchedule() przy każdym otwarciu odtwarzał
--   listę osób z surowych odpowiedzi zbiórki dyspozycyjności (get_request_grid), więc
--   każdy kto wypełnił ankietę wracał do grafiku niezależnie od wcześniejszego usunięcia.
--   Trzeba trwale zapamiętać, kogo koordynator wyłączył z danej zbiórki.
-- (kolumna celowo NIE nazywa się "excluded" — to zarezerwowane słowo pseudo-tabeli
--  w ON CONFLICT DO UPDATE SET, kolizja nazw utrudniałaby czytanie zapytania)

alter table public.schedules add column if not exists excluded_persons jsonb not null default '[]'::jsonb;

create or replace function public.get_schedule(p_request_id uuid)
returns json language sql stable security definer set search_path = public as $$
  select case when public.current_app_role() is null then null else
    (select json_build_object('status', s.status, 'cells', s.cells, 'excluded_persons', s.excluded_persons,
                              'published_at', s.published_at, 'updated_at', s.updated_at)
       from public.schedules s where s.request_id = p_request_id) end;
$$;
grant execute on function public.get_schedule(uuid) to authenticated;

create or replace function public.save_schedule(p_request_id uuid, p_cells jsonb, p_status text default 'draft', p_excluded_persons jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_who text;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  v_status := case when p_status = 'published' then 'published' else 'draft' end;
  v_who := (select name from public.app_accounts where user_id = auth.uid());
  insert into public.schedules(request_id, status, cells, excluded_persons, created_by, updated_at,
                               published_at)
    values (p_request_id, v_status, coalesce(p_cells, '{}'::jsonb), coalesce(p_excluded_persons, '[]'::jsonb), v_who, now(),
            case when v_status = 'published' then now() else null end)
  on conflict (request_id) do update set
    status = excluded.status,
    cells = excluded.cells,
    excluded_persons = excluded.excluded_persons,
    updated_at = now(),
    published_at = case when excluded.status = 'published' then now() else public.schedules.published_at end;
  perform public.log_action(
    case when v_status = 'published' then 'grafik_opublikowany' else 'grafik_ulozony' end,
    format('Ułożony grafik (%s) — %s pól', v_status, (select count(*) from jsonb_object_keys(coalesce(p_cells,'{}'::jsonb)))),
    v_who);
end $$;
grant execute on function public.save_schedule(uuid, jsonb, text, jsonb) to authenticated;

-- ========== 0065_hk_plan_room_notes.sql ==========
-- Dodatkowe info na kafelku pokoju w telefonie HK (index.html) — wiadomość
-- zbiorcza dla wszystkich pokoi grupy (np. "kapcie do pokoi", "pobudka 7:00"),
-- wysyłana z sekcji "Grupy" w HKPanel.jsx (grupy wykrywane z meal_plans.reservation_id).
alter table public.hk_plan add column if not exists room_notes jsonb default '{}'::jsonb;
