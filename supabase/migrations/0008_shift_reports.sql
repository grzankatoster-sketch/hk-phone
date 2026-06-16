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
