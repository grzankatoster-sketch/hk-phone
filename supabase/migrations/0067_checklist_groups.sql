-- 0067_checklist_groups.sql
-- Ujednolicona "checklista pokojowa": kierownik tworzy JEDNĄ checklistę (np.
-- "Sprawdź kable") i wybiera cel — HK, Konserwacja, albo oba naraz. Pod spodem
-- zależnie od celu powstają wiersze w ISTNIEJĄCYCH tabelach:
--   HK:         hk_check_plans / hk_check_items (reguła zmian AM/PM bez zmian)
--   Konserwacja: maintenance_plans / panel_plan (bez logiki zmian — przypisana
--               do osoby, nie "kto akurat sprząta")
-- checklist_groups to tylko lekki łącznik dla wspólnego widoku listy/podglądu
-- postępu w panelu — telefony wykonawców (index.html, konserwacja.html) dalej
-- czytają swoje własne tabele bez żadnych zmian.

create table if not exists public.checklist_groups (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  name       text not null,
  task       text not null,
  targets    text not null default 'hk',  -- 'hk' | 'konserw' | 'both'
  status     text not null default 'active', -- active | done
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checklist_groups_tenant_idx
  on public.checklist_groups(tenant_id, status, created_at desc);

alter table public.checklist_groups enable row level security;
drop policy if exists "checklist_groups_anon" on public.checklist_groups;
drop policy if exists "checklist_groups_auth" on public.checklist_groups;
create policy "checklist_groups_anon" on public.checklist_groups for all to anon using (true) with check (true);
create policy "checklist_groups_auth" on public.checklist_groups for all to authenticated using (true) with check (true);

alter table public.hk_check_plans add column if not exists group_id uuid references public.checklist_groups(id);
alter table public.maintenance_plans add column if not exists group_id uuid references public.checklist_groups(id);

-- Backfill: istniejące plany kontroli HK (sprzed tej migracji) dostają swoją
-- grupę, żeby nie zniknęły z nowego, ujednoliconego widoku listy „Kontrole”.
-- maintenance_plans NIE dostaje backfillu — ogólne zadania konserwacji (bez
-- powiązania z checklistą) mają zostać tylko w zakładce „Plan”.
with ins as (
  insert into public.checklist_groups (tenant_id, name, task, targets, status, created_by, created_at)
  select tenant_id, name, task, 'hk', status, created_by, created_at
  from public.hk_check_plans where group_id is null
  returning id, tenant_id, name, task, created_at
)
update public.hk_check_plans hcp set group_id = ins.id
from ins
where hcp.group_id is null and hcp.tenant_id = ins.tenant_id
  and hcp.name = ins.name and hcp.task = ins.task and hcp.created_at = ins.created_at;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='checklist_groups') then
    alter publication supabase_realtime add table public.checklist_groups;
  end if;
end $$;
