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
CREATE POLICY "anon_read_hk_plan" ON public.hk_plan
  FOR SELECT TO anon USING (true);
