-- 0012_panel_grafik.sql
-- Iteracja 4 panelu: GRAFIK = zbiórka dostępności przez linki per osoba (bez haseł).
-- Bezpieczeństwo: dostęp do danych WYŁĄCZNIE przez funkcje SECURITY DEFINER. Tabele mają
-- włączony RLS i ZERO polityk → bezpośredni odczyt/zapis (anon i authenticated) jest zablokowany.
-- Pracownik używa losowego tokenu (sekret w URL); menedżer — swojej roli (current_app_role()).

-- ─── Tabele ───────────────────────────────────────────────────────────────────
create table if not exists public.availability_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  period_type  text not null check (period_type in ('week','month')),
  period_start date not null,
  created_by   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.availability_tokens (
  token       text primary key,
  request_id  uuid not null references public.availability_requests(id) on delete cascade,
  person      text not null,
  kind        text not null default 'hk',   -- 'hk' (dzień/popołudnie) | 'recepcja' (zmiany)
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists availability_tokens_req_idx on public.availability_tokens(request_id);

create table if not exists public.availability_entries (
  token      text not null references public.availability_tokens(token) on delete cascade,
  date       date not null,
  choice     text not null,                  -- dzien|popoludnie|off | poranna|popoludniowa|nocna
  updated_at timestamptz not null default now(),
  primary key (token, date)
);

alter table public.availability_requests enable row level security;
alter table public.availability_tokens   enable row level security;
alter table public.availability_entries  enable row level security;
-- celowo BRAK polityk: dostęp tylko przez funkcje poniżej (SECURITY DEFINER).

-- ─── Menedżer: utwórz prośbę o grafik + wygeneruj linki per osoba ──────────────
-- UWAGA: funkcje grafiku logują akcje przez public.log_action() z migracji 0013_panel_audit.sql.
-- Uruchom 0013 po 0012 (plpgsql rozwiązuje nazwy funkcji przy wywołaniu, nie przy tworzeniu).
create or replace function public.create_availability_request(
  p_period_type text, p_period_start date, p_persons text[], p_kind text
) returns table(person text, token text)
language plpgsql security definer set search_path = public as $$
declare v_req uuid; v_p text; v_tok text; v_kind text; v_n int := 0;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  if p_period_type not in ('week','month') then raise exception 'Zły okres.'; end if;
  v_kind := coalesce(nullif(p_kind,''), 'hk');
  insert into public.availability_requests(tenant_id, period_type, period_start, created_by)
    values ('00000000-0000-0000-0000-000000000001', p_period_type, p_period_start,
            (select name from public.app_accounts where user_id = auth.uid()))
    returning id into v_req;
  foreach v_p in array p_persons loop
    if length(coalesce(trim(v_p),'')) = 0 then continue; end if;
    -- Krótki, niezgadywalny kod (6 znaków hex, unikalny). Daje krótkie linki.
    loop
      v_tok := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists (select 1 from public.availability_tokens t where t.token = v_tok);
    end loop;
    insert into public.availability_tokens(token, request_id, person, kind, active)
      values (v_tok, v_req, trim(v_p), v_kind, true);
    person := trim(v_p); token := v_tok; v_n := v_n + 1; return next;
  end loop;
  perform public.log_action('grafik_utworzony',
    format('Wysłał grafik (%s) od %s dla %s os.', p_period_type, p_period_start, v_n), null);
end $$;

-- ─── Pracownik: odczyt swojego grafiku po tokenie ─────────────────────────────
create or replace function public.get_availability(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  select json_build_object(
    'person', t.person, 'kind', t.kind,
    'period_type', r.period_type, 'period_start', r.period_start,
    'entries', coalesce((select json_agg(json_build_object('date', e.date, 'choice', e.choice))
                         from public.availability_entries e where e.token = t.token), '[]'::json)
  ) into v
  from public.availability_tokens t
  join public.availability_requests r on r.id = t.request_id
  where t.token = p_token and t.active;
  return v; -- null gdy token zły/nieaktywny
end $$;

-- ─── Pracownik: zapis jednego dnia ────────────────────────────────────────────
create or replace function public.set_availability(p_token text, p_date date, p_choice text)
returns void language plpgsql security definer set search_path = public as $$
declare v_person text; v_old text;
begin
  select person into v_person from public.availability_tokens where token = p_token and active;
  if v_person is null then raise exception 'Nieprawidłowy lub nieaktywny link.'; end if;
  if p_choice not in ('dzien','popoludnie','off','poranna','popoludniowa','nocna') then
    raise exception 'Zła wartość wyboru.'; end if;
  select choice into v_old from public.availability_entries where token = p_token and date = p_date;
  insert into public.availability_entries(token, date, choice)
    values (p_token, p_date, p_choice)
    on conflict (token, date) do update set choice = excluded.choice, updated_at = now();
  perform public.log_action(
    case when v_old is null then 'grafik_wpis' else 'grafik_edycja' end,
    format('%s: %s%s', p_date, p_choice, case when v_old is null then '' else ' (było: '||v_old||')' end),
    v_person);
end $$;

-- ─── Menedżer: lista próśb + zbiorcza siatka odpowiedzi ───────────────────────
-- drop: gdy ten plik jest ponownie uruchamiany na bazie, która przeszła już
-- przez 0028/0048 (szersza sygnatura), samo "create or replace" nie wystarczy —
-- Postgres nie pozwala zwęzić kolumn OUT bez jawnego DROP FUNCTION najpierw.
drop function if exists public.list_availability_requests();
create or replace function public.list_availability_requests()
returns table(id uuid, period_type text, period_start date, created_by text,
              created_at timestamptz, persons bigint, answered bigint)
language sql stable security definer set search_path = public as $$
  select r.id, r.period_type, r.period_start, r.created_by, r.created_at,
         (select count(*) from public.availability_tokens t where t.request_id = r.id) as persons,
         (select count(distinct e.token) from public.availability_entries e
            join public.availability_tokens t on t.token = e.token where t.request_id = r.id) as answered
  from public.availability_requests r
  where public.current_app_role() is not null
  order by r.created_at desc limit 50;
$$;

-- drop: ten sam powód co wyżej — 0024/0031 poszerzają kolumny OUT.
drop function if exists public.get_request_grid(uuid);
create or replace function public.get_request_grid(p_request_id uuid)
returns table(person text, token text, kind text, date date, choice text)
language sql stable security definer set search_path = public as $$
  select t.person, t.token, t.kind, e.date, e.choice
  from public.availability_tokens t
  left join public.availability_entries e on e.token = t.token
  where t.request_id = p_request_id and public.current_app_role() is not null
  order by t.person, e.date;
$$;

-- ─── Uprawnienia wykonania ────────────────────────────────────────────────────
grant execute on function public.get_availability(text)                       to anon, authenticated;
grant execute on function public.set_availability(text, date, text)           to anon, authenticated;
grant execute on function public.create_availability_request(text, date, text[], text) to authenticated;
grant execute on function public.list_availability_requests()                 to authenticated;
grant execute on function public.get_request_grid(uuid)                       to authenticated;
