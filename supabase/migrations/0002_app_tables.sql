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
CREATE POLICY "anon_read_rooms" ON public.rooms FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_managers" ON public.managers FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_app_settings" ON public.app_settings FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_default_tasks" ON public.default_tasks FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_manager_alerts" ON public.manager_alerts FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_standing_reminders" ON public.standing_reminders FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_faults" ON public.faults FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_messages" ON public.messages FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_vouchers" ON public.vouchers FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_booking_reviews" ON public.booking_reviews FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_schedule" ON public.schedule FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_shift_reports" ON public.shift_reports FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_daily_reports" ON public.daily_reports FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_payment_corrections" ON public.payment_corrections FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_hk_adhoc_tasks" ON public.hk_adhoc_tasks FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_caretaker_tokens" ON public.caretaker_tokens FOR SELECT TO anon USING (true);
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
CREATE POLICY "anon_read_push_subscriptions" ON public.push_subscriptions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_push_subscriptions" ON public.push_subscriptions FOR ALL TO anon USING (true) WITH CHECK (true);
