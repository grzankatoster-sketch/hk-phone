-- 0030_grafik_multi_shift.sql
-- Dwie rzeczy:
--   1) FIX zapisu kafelków: w realnej bazie istniały DWIE funkcje set_availability —
--      stara 3-arg (0012) i nowa 5-arg (0024/0028). Wywołanie z 3 argumentami było dla
--      PostgREST niejednoznaczne (PGRST203 „Could not choose the best candidate function"),
--      więc klik zmiany kończył się „Nie zapisano", a zapis godzin (5 argów) działał.
--      Usuwamy starą wersję, zostaje jedna funkcja.
--   2) WIELE ZMIAN na dzień: recepcja może zaznaczyć kilka zmian naraz (np. "poranna,nocna").
--      Walidacja sprawdza teraz KAŻDĄ część rozdzieloną przecinkiem, a nie całość.
-- Idempotentne / bezpieczne do ponownego uruchomienia.

-- Kolumny godzin (gdyby 0029 nie było wgrane) — bez nich INSERT poniżej rzuca błędem.
alter table public.availability_entries add column if not exists start_h text;
alter table public.availability_entries add column if not exists end_h   text;

-- (1) Usuń starą, kolidującą wersję 3-argumentową.
drop function if exists public.set_availability(text, date, text);

-- (2) Redefinicja wersji 5-arg z walidacją per-część (obsługa "poranna,nocna").
create or replace function public.set_availability(p_token text, p_date date, p_choice text, p_start text default null, p_end text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_person text; v_old text; v_exp timestamptz; v_part text;
begin
  select t.person, r.expires_at into v_person, v_exp
    from public.availability_tokens t
    join public.availability_requests r on r.id = t.request_id
    where t.token = p_token and t.active;
  if v_person is null then raise exception 'Nieprawidłowy lub nieaktywny link.'; end if;
  if v_exp is not null and v_exp <= now() then raise exception 'Zbiórka zamknięta — link wygasł.'; end if;
  -- Każda część (rozdzielona przecinkiem) musi być dozwoloną zmianą.
  foreach v_part in array string_to_array(p_choice, ',') loop
    if btrim(v_part) not in ('dzien','popoludnie','off','poranna','popoludniowa','nocna','dzienna','godziny','oba') then
      raise exception 'Zła wartość wyboru: %', v_part; end if;
  end loop;
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
