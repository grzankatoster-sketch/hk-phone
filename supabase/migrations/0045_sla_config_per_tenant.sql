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
