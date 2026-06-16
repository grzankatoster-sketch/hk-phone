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
