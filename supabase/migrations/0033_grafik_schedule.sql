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
