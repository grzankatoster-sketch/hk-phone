-- 0024_panel_grafik_hours.sql
-- Drugi tryb dyspozycyjności pracownika: własny zakres GODZIN (od-do), obok wyboru zmiany.
-- Rozwiązuje przypadek „mogę 16-22", którego sztywna zmiana 15-22 nie obejmuje.

alter table public.availability_entries add column if not exists start_h text;
alter table public.availability_entries add column if not exists end_h   text;

-- set_availability z opcjonalnymi godzinami (choice='godziny' + start/end). Stara 3-arg wersja zostaje.
create or replace function public.set_availability(p_token text, p_date date, p_choice text, p_start text default null, p_end text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_person text; v_old text;
begin
  select person into v_person from public.availability_tokens where token = p_token and active;
  if v_person is null then raise exception 'Nieprawidłowy lub nieaktywny link.'; end if;
  if p_choice not in ('dzien','popoludnie','off','poranna','popoludniowa','nocna','dzienna','godziny') then
    raise exception 'Zła wartość wyboru.'; end if;
  select choice into v_old from public.availability_entries where token = p_token and date = p_date;
  insert into public.availability_entries(token, date, choice, start_h, end_h)
    values (p_token, p_date, p_choice, nullif(p_start,''), nullif(p_end,''))
    on conflict (token, date) do update set choice = excluded.choice, start_h = excluded.start_h, end_h = excluded.end_h, updated_at = now();
  perform public.log_action(
    case when v_old is null then 'grafik_wpis' else 'grafik_edycja' end,
    format('%s: %s%s', p_date,
      case when p_choice='godziny' then coalesce(p_start,'')||'-'||coalesce(p_end,'') else p_choice end,
      case when v_old is null then '' else ' (było: '||v_old||')' end),
    v_person);
end $$;
grant execute on function public.set_availability(text, date, text, text, text) to anon, authenticated;

-- get_availability zwraca też godziny.
create or replace function public.get_availability(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  select json_build_object(
    'person', t.person, 'kind', t.kind, 'period_type', r.period_type, 'period_start', r.period_start,
    'entries', coalesce((select json_agg(json_build_object('date', e.date, 'choice', e.choice, 'start', e.start_h, 'end', e.end_h))
                         from public.availability_entries e where e.token = t.token), '[]'::json)
  ) into v
  from public.availability_tokens t
  join public.availability_requests r on r.id = t.request_id
  where t.token = p_token and t.active;
  return v;
end $$;

-- get_request_grid zwraca też godziny (zmiana typu zwracanego → drop+create).
drop function if exists public.get_request_grid(uuid);
create function public.get_request_grid(p_request_id uuid)
returns table(person text, token text, kind text, date date, choice text, start_h text, end_h text)
language sql stable security definer set search_path = public as $$
  select t.person, t.token, t.kind, e.date, e.choice, e.start_h, e.end_h
  from public.availability_tokens t
  left join public.availability_entries e on e.token = t.token
  where t.request_id = p_request_id and public.current_app_role() is not null
  order by t.person, e.date;
$$;
grant execute on function public.get_request_grid(uuid) to authenticated;
