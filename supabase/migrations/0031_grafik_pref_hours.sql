-- 0031_grafik_pref_hours.sql
-- GRAFIK (zbiórka dyspozycyjności): preferowana liczba godzin na kolejny okres.
--   Pracownik wpisuje na dole strony grafiku JEDNĄ liczbę — ile godzin chce przepracować
--   w kolejnym miesiącu. To wartość per osoba (token), nie per dzień. Menedżer widzi ją
--   w podglądzie odpowiedzi. Niezależna od dziennej dyspozycyjności (godziny od–do).
-- Idempotentne / bezpieczne do ponownego uruchomienia.

-- ─── Kolumna preferencji na tokenie (jedna wartość per osoba w danej zbiórce) ───
alter table public.availability_tokens add column if not exists pref_hours int;

-- ─── Pracownik: zapis preferowanej liczby godzin (walidacja okna czasu jak set_availability) ───
create or replace function public.set_pref_hours(p_token text, p_hours int)
returns void language plpgsql security definer set search_path = public as $$
declare v_person text; v_exp timestamptz;
begin
  select t.person, r.expires_at into v_person, v_exp
    from public.availability_tokens t
    join public.availability_requests r on r.id = t.request_id
    where t.token = p_token and t.active;
  if v_person is null then raise exception 'Nieprawidłowy lub nieaktywny link.'; end if;
  if v_exp is not null and v_exp <= now() then raise exception 'Zbiórka zamknięta — link wygasł.'; end if;
  if p_hours is not null and (p_hours < 0 or p_hours > 400) then
    raise exception 'Liczba godzin poza zakresem (0–400).'; end if;
  update public.availability_tokens set pref_hours = p_hours where token = p_token;
  perform public.log_action('grafik_edycja',
    format('preferencja godzin na okres: %s', coalesce(p_hours::text, '—')), v_person);
end $$;
grant execute on function public.set_pref_hours(text, int) to anon, authenticated;

-- ─── Pracownik: odczyt grafiku zwraca też pref_hours (do wczytania pola na stronie) ───
-- Bazuje na żywej definicji z 0028 (expires_at, godziny w entries) — dokładamy pref_hours.
create or replace function public.get_availability(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  select json_build_object(
    'person', t.person, 'kind', t.kind, 'period_type', r.period_type, 'period_start', r.period_start,
    'expires_at', r.expires_at, 'pref_hours', t.pref_hours,
    'entries', coalesce((select json_agg(json_build_object('date', e.date, 'choice', e.choice, 'start', e.start_h, 'end', e.end_h))
                         from public.availability_entries e where e.token = t.token), '[]'::json)
  ) into v
  from public.availability_tokens t
  join public.availability_requests r on r.id = t.request_id
  where t.token = p_token and t.active
    and (r.expires_at is null or r.expires_at > now());
  return v;
end $$;
grant execute on function public.get_availability(text) to anon, authenticated;

-- ─── Menedżer: siatka odpowiedzi zwraca też pref_hours (podgląd w panelu) ───
drop function if exists public.get_request_grid(uuid);
create function public.get_request_grid(p_request_id uuid)
returns table(person text, token text, kind text, date date, choice text, start_h text, end_h text, pref_hours int)
language sql stable security definer set search_path = public as $$
  select t.person, t.token, t.kind, e.date, e.choice, e.start_h, e.end_h, t.pref_hours
  from public.availability_tokens t
  left join public.availability_entries e on e.token = t.token
  where t.request_id = p_request_id and public.current_app_role() is not null
  order by t.person, e.date;
$$;
grant execute on function public.get_request_grid(uuid) to authenticated;
