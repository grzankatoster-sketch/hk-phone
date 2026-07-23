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
