-- 0064_schedule_excluded.sql
-- FIX: "Ułóż grafik" nie pozwalał trwale usunąć osoby z tabeli — schedRemovePerson
--   usuwał ją tylko z pamięci sesji, a openSchedule() przy każdym otwarciu odtwarzał
--   listę osób z surowych odpowiedzi zbiórki dyspozycyjności (get_request_grid), więc
--   każdy kto wypełnił ankietę wracał do grafiku niezależnie od wcześniejszego usunięcia.
--   Trzeba trwale zapamiętać, kogo koordynator wyłączył z danej zbiórki.
-- (kolumna celowo NIE nazywa się "excluded" — to zarezerwowane słowo pseudo-tabeli
--  w ON CONFLICT DO UPDATE SET, kolizja nazw utrudniałaby czytanie zapytania)

alter table public.schedules add column if not exists excluded_persons jsonb not null default '[]'::jsonb;

create or replace function public.get_schedule(p_request_id uuid)
returns json language sql stable security definer set search_path = public as $$
  select case when public.current_app_role() is null then null else
    (select json_build_object('status', s.status, 'cells', s.cells, 'excluded_persons', s.excluded_persons,
                              'published_at', s.published_at, 'updated_at', s.updated_at)
       from public.schedules s where s.request_id = p_request_id) end;
$$;
grant execute on function public.get_schedule(uuid) to authenticated;

create or replace function public.save_schedule(p_request_id uuid, p_cells jsonb, p_status text default 'draft', p_excluded_persons jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_who text;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  v_status := case when p_status = 'published' then 'published' else 'draft' end;
  v_who := (select name from public.app_accounts where user_id = auth.uid());
  insert into public.schedules(request_id, status, cells, excluded_persons, created_by, updated_at,
                               published_at)
    values (p_request_id, v_status, coalesce(p_cells, '{}'::jsonb), coalesce(p_excluded_persons, '[]'::jsonb), v_who, now(),
            case when v_status = 'published' then now() else null end)
  on conflict (request_id) do update set
    status = excluded.status,
    cells = excluded.cells,
    excluded_persons = excluded.excluded_persons,
    updated_at = now(),
    published_at = case when excluded.status = 'published' then now() else public.schedules.published_at end;
  perform public.log_action(
    case when v_status = 'published' then 'grafik_opublikowany' else 'grafik_ulozony' end,
    format('Ułożony grafik (%s) — %s pól', v_status, (select count(*) from jsonb_object_keys(coalesce(p_cells,'{}'::jsonb)))),
    v_who);
end $$;
grant execute on function public.save_schedule(uuid, jsonb, text, jsonb) to authenticated;
