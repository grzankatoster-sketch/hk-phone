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
