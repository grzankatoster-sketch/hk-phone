-- 0028_panel_grafik_ttl_hk.sql
-- Dwie zmiany w GRAFIKU (zbiórka dyspozycyjności):
--  1) OKNO CZASU: link jest aktywny tylko przez wybrane okno (24h / 48h / 7 dni). Po tym
--     czasie „system się zamyka" — get_availability zwraca null, a set_availability odmawia.
--     Menedżer wybiera okno przy wysyłce (p_ttl_hours). Stare grafiki bez expires_at = bez limitu.
--  2) HK = dwie wersje zmiany: Rano (poranna) i Popołudnie. Pracownik może zaznaczyć jedną
--     LUB obie (choice 'oba'). Dodajemy 'oba' do dozwolonych wartości.
-- Bazuje na żywych definicjach z 0024 (godziny) — modyfikuje je o okno czasu i 'oba'.

-- ─── 1. Okno czasu na requeście ───────────────────────────────────────────────
alter table public.availability_requests add column if not exists expires_at timestamptz;

-- ─── Menedżer: utwórz prośbę z oknem czasu (p_ttl_hours; domyślnie 24h) ────────
-- Zmiana sygnatury → usuwamy starą 4-arg wersję i tworzymy 5-arg z domyślnym p_ttl_hours,
-- żeby istniejące wywołania (bez okna) nadal działały (24h).
drop function if exists public.create_availability_request(text, date, text[], text);
create or replace function public.create_availability_request(
  p_period_type text, p_period_start date, p_persons text[], p_kind text, p_ttl_hours int default 24
) returns table(person text, token text)
language plpgsql security definer set search_path = public as $$
declare v_req uuid; v_p text; v_tok text; v_kind text; v_n int := 0; v_ttl int; v_exp timestamptz;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  if p_period_type not in ('week','month') then raise exception 'Zły okres.'; end if;
  v_kind := coalesce(nullif(p_kind,''), 'hk');
  -- Akceptujemy tylko sensowne okna; spoza zakresu → 24h.
  v_ttl := coalesce(p_ttl_hours, 24);
  if v_ttl not in (24, 48, 168) then v_ttl := 24; end if;
  v_exp := now() + (v_ttl || ' hours')::interval;
  insert into public.availability_requests(tenant_id, period_type, period_start, created_by, expires_at)
    values ('00000000-0000-0000-0000-000000000001', p_period_type, p_period_start,
            (select name from public.app_accounts where user_id = auth.uid()), v_exp)
    returning id into v_req;
  foreach v_p in array p_persons loop
    if length(coalesce(trim(v_p),'')) = 0 then continue; end if;
    loop
      v_tok := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists (select 1 from public.availability_tokens t where t.token = v_tok);
    end loop;
    insert into public.availability_tokens(token, request_id, person, kind, active)
      values (v_tok, v_req, trim(v_p), v_kind, true);
    person := trim(v_p); token := v_tok; v_n := v_n + 1; return next;
  end loop;
  perform public.log_action('grafik_utworzony',
    format('Wysłał grafik (%s) od %s dla %s os. (okno %sh)', p_period_type, p_period_start, v_n, v_ttl), null);
end $$;
grant execute on function public.create_availability_request(text, date, text[], text, int) to authenticated;

-- ─── Pracownik: odczyt grafiku — tylko gdy aktywny i w oknie czasu ─────────────
-- Zwraca też expires_at (do licznika na stronie). Po wygaśnięciu → null (strona pokaże „zamknięte").
create or replace function public.get_availability(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  select json_build_object(
    'person', t.person, 'kind', t.kind, 'period_type', r.period_type, 'period_start', r.period_start,
    'expires_at', r.expires_at,
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

-- ─── Pracownik: zapis dnia — odmowa po wygaśnięciu okna; HK dopuszcza 'oba' ─────
create or replace function public.set_availability(p_token text, p_date date, p_choice text, p_start text default null, p_end text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_person text; v_old text; v_exp timestamptz;
begin
  select t.person, r.expires_at into v_person, v_exp
    from public.availability_tokens t
    join public.availability_requests r on r.id = t.request_id
    where t.token = p_token and t.active;
  if v_person is null then raise exception 'Nieprawidłowy lub nieaktywny link.'; end if;
  if v_exp is not null and v_exp <= now() then raise exception 'Zbiórka zamknięta — link wygasł.'; end if;
  if p_choice not in ('dzien','popoludnie','off','poranna','popoludniowa','nocna','dzienna','godziny','oba') then
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

-- ─── Menedżer: lista próśb zwraca też expires_at (licznik / „zamknięte" w panelu) ─
drop function if exists public.list_availability_requests();
create function public.list_availability_requests()
returns table(id uuid, period_type text, period_start date, created_by text,
              created_at timestamptz, expires_at timestamptz, persons bigint, answered bigint)
language sql stable security definer set search_path = public as $$
  select r.id, r.period_type, r.period_start, r.created_by, r.created_at, r.expires_at,
         (select count(*) from public.availability_tokens t where t.request_id = r.id) as persons,
         (select count(distinct e.token) from public.availability_entries e
            join public.availability_tokens t on t.token = e.token where t.request_id = r.id) as answered
  from public.availability_requests r
  where public.current_app_role() is not null
  order by r.created_at desc limit 50;
$$;
grant execute on function public.list_availability_requests() to authenticated;
