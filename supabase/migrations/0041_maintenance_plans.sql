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
