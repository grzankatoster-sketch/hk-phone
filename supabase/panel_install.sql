-- PANEL MENEDŻERSKI — INSTALATOR (wklej CAŁOŚĆ do Supabase SQL Editor → Run)
-- Migracje 0010-0025 + seed. Idempotentne.


-- ========== 0010_panel_auth.sql ==========
-- 0010_panel_auth.sql
-- Panel menedżerski: logowanie po imieniu (spis) + pierwsze hasło (Supabase Auth),
-- role i mapa konto->rola. Osobne od tabeli `managers` (logowanie kierownika w apce React).
-- Hasła trzyma Supabase Auth (bcrypt) — tu NIE ma hasła, tylko spis + rola + powiązanie z auth.users.

-- ─── app_accounts ─────────────────────────────────────────────────────────────
create table if not exists public.app_accounts (
  user_id    uuid unique references auth.users(id) on delete set null, -- null = konto jeszcze nieprzejęte
  tenant_id  uuid not null,
  name       text not null,            -- wyświetlane imię (spis logowania)
  email      text not null unique,     -- syntetyczny, ukryty login: <slug>@conrad-panel.com
  role       text not null check (role in
               ('admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')),
  claimed    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.app_accounts enable row level security;

-- Spis na ekranie logowania (imię/rola/email/claimed). Hasła tu nie ma, więc odczyt jest bezpieczny.
drop policy if exists "accounts_public_list" on public.app_accounts;
create policy "accounts_public_list" on public.app_accounts
  for select to anon, authenticated using (true);

-- ─── current_app_role() ───────────────────────────────────────────────────────
-- Rola zalogowanego użytkownika — używana przez panel po zalogowaniu oraz przez RLS
-- w kolejnych iteracjach (polityki tabel danych będą sprawdzać current_app_role()).
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.app_accounts where user_id = auth.uid()
$$;

-- ─── claim_account(email) ─────────────────────────────────────────────────────
-- Pierwsze logowanie: po utworzeniu konta Auth (signUp) wiążemy je z wierszem spisu.
-- Działa tylko gdy wiersz jest jeszcze nieprzejęty (user_id is null). Zwraca rolę.
create or replace function public.claim_account(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null then
    raise exception 'Brak zalogowania.';
  end if;
  update public.app_accounts
     set user_id = auth.uid(), claimed = true
   where email = p_email and user_id is null
   returning role into v_role;
  -- Gdy wiersz był już przejęty/email nieznany — zwróć rolę bieżącego usera (jeśli to jego konto).
  if v_role is null then
    select role into v_role from public.app_accounts where user_id = auth.uid();
  end if;
  return v_role;
end $$;

grant execute on function public.current_app_role()      to anon, authenticated;
grant execute on function public.claim_account(text)     to anon, authenticated;

-- ─── Dostęp dla zalogowanych (authenticated) do tabel czytanych przez panel ─────
-- Istniejące polityki są tylko `TO anon`, więc zalogowany użytkownik panelu (rola
-- `authenticated`) NIE widziałby tych danych. Te tabele są i tak publicznie czytelne
-- przez anon — dokładamy więc równoważny odczyt dla authenticated (bez regresu).
-- Zapis pozostaje jak był; panel na razie tylko czyta.
do $$
declare t text;
begin
  foreach t in array array[
    'hk_plan','hk_rooms','hk_logs','hk_tasks','hk_workers',
    'faults','shift_reports','hk_adhoc_tasks','schedule','hk_roster'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_auth_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_auth_read', t);
  end loop;
end $$;


-- ========== 0011_panel_recepcja.sql ==========
-- 0011_panel_recepcja.sql
-- Iteracja 3 panelu: recepcja/koordynator — przekazane zadania + stan kasy.
-- Komputer recepcji (App.jsx) czyta `manager_alerts` na żywo; panel pozwala je DODAWAĆ z telefonu.
-- shift_reports ma już odczyt dla authenticated (0010 dodał *_auth_read) — tu dokładamy
-- odczyt + zapis manager_alerts dla zalogowanych z rolą panelu.

-- Odczyt manager_alerts dla zalogowanych (lista przekazanych zadań w panelu).
drop policy if exists "manager_alerts_auth_read" on public.manager_alerts;
create policy "manager_alerts_auth_read" on public.manager_alerts
  for select to authenticated using (true);

-- Zapis: tylko zalogowani z przypisaną rolą panelu (current_app_role() != null).
-- Dzięki temu „przekazanie zadania na komputer" działa, ale nie dla przypadkowego anona z kluczem.
drop policy if exists "manager_alerts_auth_insert" on public.manager_alerts;
create policy "manager_alerts_auth_insert" on public.manager_alerts
  for insert to authenticated
  with check ( public.current_app_role() is not null );


-- ========== 0012_panel_grafik.sql ==========
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

create or replace function public.get_request_grid(p_request_id uuid)
returns table(person text, token text, kind text, date date, choice text)
language sql stable security definer set search_path = public as $$
  select t.person, t.token, t.kind, e.date, e.choice
  from public.availability_tokens t
  left join public.availability_entries e on e.token = t.token
  where t.request_id = p_request_id and public.current_app_role() is not null
  order by t.person, e.date;
$$;

-- Usuwanie grafiku (kaskada kasuje tokeny/odpowiedzi). Menedżer tylko swoje, admin dowolne.
create or replace function public.delete_availability_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_me text; v_owner text;
begin
  v_role := public.current_app_role();
  if v_role is null then raise exception 'Brak uprawnień.'; end if;
  select name into v_me from public.app_accounts where user_id = auth.uid();
  select created_by into v_owner from public.availability_requests where id = p_request_id;
  if v_owner is null then return; end if;
  if v_role <> 'admin' and coalesce(v_owner,'') <> coalesce(v_me,'') then
    raise exception 'Możesz usuwać tylko własne grafiki.';
  end if;
  delete from public.availability_requests where id = p_request_id;
  perform public.log_action('grafik_usuniety', format('Usunął grafik %s', p_request_id), null);
end $$;

-- ─── Uprawnienia wykonania ────────────────────────────────────────────────────
grant execute on function public.get_availability(text)                       to anon, authenticated;
grant execute on function public.set_availability(text, date, text)           to anon, authenticated;
grant execute on function public.create_availability_request(text, date, text[], text) to authenticated;
grant execute on function public.list_availability_requests()                 to authenticated;
grant execute on function public.get_request_grid(uuid)                       to authenticated;
grant execute on function public.delete_availability_request(uuid)            to authenticated;


-- ========== 0013_panel_audit.sql ==========
-- 0013_panel_audit.sql
-- Spis akcji panelu: kto co zrobił / edytował (grafik, zadania itd.).
-- Dostęp tylko przez funkcje SECURITY DEFINER (tabela ma RLS bez polityk).
-- Uruchom PO 0012 (funkcje grafiku wołają public.log_action()).

create table if not exists public.panel_audit (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  actor      text,            -- imię osoby/menedżera (lub '—')
  actor_role text,            -- rola panelu (null dla pracownika z linku)
  action     text not null,   -- grafik_utworzony | grafik_wpis | grafik_edycja | zadanie_dodane | ...
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists panel_audit_created_idx on public.panel_audit(created_at desc);

alter table public.panel_audit enable row level security;  -- brak polityk: dostęp przez RPC

-- Zapis wpisu audytu. p_actor podawane jawnie dla akcji pracownika (anon po tokenie);
-- dla menedżera (authenticated) brane z app_accounts po auth.uid().
create or replace function public.log_action(p_action text, p_detail text, p_actor text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text; v_role text;
begin
  v_role  := public.current_app_role();
  v_actor := coalesce(p_actor, (select name from public.app_accounts where user_id = auth.uid()));
  insert into public.panel_audit(actor, actor_role, action, detail)
    values (coalesce(v_actor, '—'), v_role, p_action, p_detail);
end $$;

-- Odczyt ostatnich akcji (tylko zalogowani z rolą panelu).
create or replace function public.list_panel_audit()
returns table(actor text, actor_role text, action text, detail text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select actor, actor_role, action, detail, created_at
  from public.panel_audit
  where public.current_app_role() is not null
  order by created_at desc limit 100;
$$;

grant execute on function public.log_action(text, text, text) to anon, authenticated;
grant execute on function public.list_panel_audit()            to authenticated;


-- ========== 0014_panel_konserwatorzy.sql ==========
-- 0014_panel_konserwatorzy.sql
-- Iteracja 5 panelu: menedżer główny/operacyjny dodaje zadania konserwatorom.
-- Zadanie = wpis do `faults` (assigned_to = konserwator). Istniejący Database Webhook na INSERT
-- do `faults` automatycznie wyśle push (push-send) — bez dodatkowego kodu.
-- Odczyt faults dla authenticated dodaliśmy w 0010; tu dokładamy INSERT dla zalogowanych z rolą.

drop policy if exists "faults_auth_insert" on public.faults;
create policy "faults_auth_insert" on public.faults
  for insert to authenticated
  with check ( public.current_app_role() is not null );


-- ========== 0015_panel_admin_ttl.sql ==========
-- 0015_panel_admin_ttl.sql
-- Iteracja 6: panel admina (zakładanie kont + role) i TTL 14 dni dla danych panelu.
-- Admin nie tworzy kont Auth ręcznie — wpisuje tylko imię+rolę do app_accounts; konto Auth
-- powstaje przy pierwszym logowaniu danej osoby (signUp + claim_account), jak dotąd.

-- Flaga aktywności konta (dezaktywowane znika ze spisu logowania).
alter table public.app_accounts add column if not exists active boolean not null default true;

-- ─── Admin: lista / dodanie / zmiana roli / aktywacja kont ─────────────────────
create or replace function public.admin_list_accounts()
returns table(name text, email text, role text, claimed boolean, active boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select name, email, role, claimed, active, created_at
  from public.app_accounts
  where public.current_app_role() = 'admin'
  order by created_at;
$$;

create or replace function public.admin_add_account(p_name text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  if p_role not in ('admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
    then raise exception 'Zła rola.'; end if;
  -- Email jest tylko wewnętrznym, ukrytym loginem — generujemy losowy i unikalny.
  v_email := 'acc_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10) || '@conrad-panel.com';
  insert into public.app_accounts(tenant_id, name, email, role)
    values ('00000000-0000-0000-0000-000000000001', trim(p_name), v_email, p_role);
  perform public.log_action('konto_dodane', format('%s (%s)', trim(p_name), p_role), null);
  return v_email;
end $$;

create or replace function public.admin_set_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if p_role not in ('admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
    then raise exception 'Zła rola.'; end if;
  update public.app_accounts set role = p_role where email = p_email;
  perform public.log_action('konto_rola', format('%s → %s', p_email, p_role), null);
end $$;

create or replace function public.admin_set_active(p_email text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  update public.app_accounts set active = p_active where email = p_email;
  perform public.log_action('konto_aktywne', format('%s = %s', p_email, p_active), null);
end $$;

grant execute on function public.admin_list_accounts()           to authenticated;
grant execute on function public.admin_add_account(text, text)   to authenticated;
grant execute on function public.admin_set_role(text, text)      to authenticated;
grant execute on function public.admin_set_active(text, boolean) to authenticated;

-- ─── TTL 14 dni — auto-czyszczenie TYLKO danych panelu ────────────────────────
-- Czyścimy dane panelu (audyt, grafiki, przekazane zadania). NIE ruszamy danych aplikacji
-- recepcji (shift_reports, hk_*, faults to historia/operacje recepcji).
create or replace function public.panel_ttl_cleanup()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.panel_audit            where created_at < now() - interval '14 days';
  delete from public.availability_requests  where created_at < now() - interval '14 days'; -- kaskada tokens/entries
  delete from public.manager_alerts         where created_at < now() - interval '14 days';
end $$;

-- Harmonogram: codziennie o 03:00 (wymaga rozszerzenia pg_cron — Dashboard → Database → Extensions).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'panel_ttl') then
      perform cron.unschedule('panel_ttl');
    end if;
    perform cron.schedule('panel_ttl', '0 3 * * *', 'select public.panel_ttl_cleanup();');
  else
    raise notice 'pg_cron nie jest wlaczone — TTL pominiete. Wlacz rozszerzenie i uruchom 0015 ponownie (albo wolaj panel_ttl_cleanup() recznie).';
  end if;
end $$;


-- ========== 0016_panel_hardening.sql ==========
-- 0016_panel_hardening.sql
-- Hardening panelu: oznaczanie zadań zrobionych, planowanie obsady, odwołanie/regeneracja
-- linków grafiku, reset hasła konta (admin), opcjonalny kod jednorazowy na 1. logowanie.

-- ── H3: oznaczanie przekazanych zadań (manager_alerts) jako zrobione ──
alter table public.manager_alerts add column if not exists done    boolean not null default false;
alter table public.manager_alerts add column if not exists done_at timestamptz;
alter table public.manager_alerts add column if not exists done_by text;
drop policy if exists "manager_alerts_auth_update" on public.manager_alerts;
create policy "manager_alerts_auth_update" on public.manager_alerts
  for update to authenticated
  using ( public.current_app_role() is not null )
  with check ( public.current_app_role() is not null );

-- ── H5: planowanie obsady HK z panelu (hk_roster: tenant_id+date → roster jsonb) ──
drop policy if exists "hk_roster_auth_insert" on public.hk_roster;
create policy "hk_roster_auth_insert" on public.hk_roster
  for insert to authenticated with check ( public.current_app_role() is not null );
drop policy if exists "hk_roster_auth_update" on public.hk_roster;
create policy "hk_roster_auth_update" on public.hk_roster
  for update to authenticated
  using ( public.current_app_role() is not null )
  with check ( public.current_app_role() is not null );

-- ── H2: odwołanie / regeneracja linku grafiku ──
create or replace function public.set_token_active(p_token text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  update public.availability_tokens set active = p_active where token = p_token;
end $$;

create or replace function public.regenerate_token(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare v_req uuid; v_person text; v_kind text; v_new text;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  select request_id, person, kind into v_req, v_person, v_kind from public.availability_tokens where token = p_token;
  if v_req is null then raise exception 'Nie znaleziono linku.'; end if;
  update public.availability_tokens set active = false where token = p_token;
  loop v_new := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
       exit when not exists (select 1 from public.availability_tokens t where t.token = v_new); end loop;
  insert into public.availability_tokens(token, request_id, person, kind, active)
    values (v_new, v_req, v_person, v_kind, true);
  perform public.log_action('grafik_link_reset', v_person, null);
  return v_new;
end $$;
grant execute on function public.set_token_active(text, boolean) to authenticated;
grant execute on function public.regenerate_token(text)         to authenticated;

-- ── H1: reset hasła konta (admin) — rotacja ukrytego e-maila wymusza nowe „pierwsze hasło” ──
create or replace function public.admin_reset_account(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_new text;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  v_new := 'acc_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10) || '@conrad-panel.com';
  update public.app_accounts set email = v_new, user_id = null, claimed = false where email = p_email;
  perform public.log_action('konto_reset', p_email, null);
  return v_new;
end $$;
grant execute on function public.admin_reset_account(text) to authenticated;

-- ── H4: opcjonalny kod jednorazowy na 1. logowanie (chroni przed przejęciem konta) ──
alter table public.app_accounts add column if not exists requires_code   boolean not null default false;
alter table public.app_accounts add column if not exists claim_code_hash text;
-- Hash kodu nie może być czytany przez klienta (kod jest krótki → md5 dałoby się złamać).
-- Funkcje SECURITY DEFINER (poniżej) i tak go widzą jako właściciel.
revoke select (claim_code_hash) on public.app_accounts from anon;
revoke select (claim_code_hash) on public.app_accounts from authenticated;

-- Wstępna weryfikacja kodu PRZED signUp (klient: jeśli ok → tworzy konto Auth).
create or replace function public.precheck_claim(p_email text, p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when a.requires_code is not true then true
              else a.claim_code_hash is not null and a.claim_code_hash = md5(coalesce(p_code, ''))
         end
  from public.app_accounts a where a.email = p_email;
$$;
grant execute on function public.precheck_claim(text, text) to anon, authenticated;

-- claim_account z kodem (2-argumentowa wersja — panel woła ją zawsze; kod=null gdy niewymagany).
create or replace function public.claim_account(p_email text, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_role text; v_req boolean; v_hash text;
begin
  if auth.uid() is null then raise exception 'Brak zalogowania.'; end if;
  select requires_code, claim_code_hash into v_req, v_hash from public.app_accounts where email = p_email;
  if v_req is true and (v_hash is null or v_hash <> md5(coalesce(p_code, ''))) then
    raise exception 'Nieprawidłowy kod.'; end if;
  update public.app_accounts set user_id = auth.uid(), claimed = true
    where email = p_email and user_id is null returning role into v_role;
  if v_role is null then select role into v_role from public.app_accounts where user_id = auth.uid(); end if;
  return v_role;
end $$;
grant execute on function public.claim_account(text, text) to anon, authenticated;

-- admin_add_account z opcjonalnym kodem (3-argumentowa wersja).
create or replace function public.admin_add_account(p_name text, p_role text, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text; v_has_code boolean;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  if p_role not in ('admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
    then raise exception 'Zła rola.'; end if;
  v_has_code := coalesce(trim(p_code),'') <> '';
  v_email := 'acc_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10) || '@conrad-panel.com';
  insert into public.app_accounts(tenant_id, name, email, role, requires_code, claim_code_hash)
    values ('00000000-0000-0000-0000-000000000001', trim(p_name), v_email, p_role,
            v_has_code, case when v_has_code then md5(trim(p_code)) else null end);
  perform public.log_action('konto_dodane',
    format('%s (%s)%s', trim(p_name), p_role, case when v_has_code then ' + kod' else '' end), null);
  return v_email;
end $$;
grant execute on function public.admin_add_account(text, text, text) to authenticated;


-- ========== 0017_panel_login.sql ==========
-- 0017_panel_login.sql
-- Logowanie „jak na poczcie": formularz login (imię) + hasło. Admin może USTAWIĆ/ZRESETOWAĆ
-- hasło dowolnego konta (bez Edge Function), aktualizując auth.users przez funkcję SECURITY DEFINER.

create extension if not exists pgcrypto with schema extensions;

-- Admin ustawia hasło konta (reset). Działa tylko dla kont już aktywnych w Auth.
-- Potwierdza też e-mail, więc logowanie działa nawet przy włączonym „Confirm email".
create or replace function public.admin_set_password(p_email text, p_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'Hasło min. 6 znaków.'; end if;
  select id into v_uid from auth.users where email = p_email;
  if v_uid is null then return false; end if;  -- konto jeszcze nieaktywne (osoba ustawi hasło sama)
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = v_uid;
  update public.app_accounts set claimed = true where email = p_email;
  perform public.log_action('konto_haslo', p_email, null);
  return true;
end $$;
grant execute on function public.admin_set_password(text, text) to authenticated;


-- ========== 0018_panel_board.sql ==========
-- 0018_panel_board.sql
-- Tablica: stałe przypomnienia (standing_reminders) widoczne i edytowalne z panelu.
-- manager_alerts i tak ma już polityki dla authenticated (0011). Tu dokładamy standing_reminders.

drop policy if exists "standing_reminders_auth_read" on public.standing_reminders;
create policy "standing_reminders_auth_read" on public.standing_reminders
  for select to authenticated using (true);

drop policy if exists "standing_reminders_auth_insert" on public.standing_reminders;
create policy "standing_reminders_auth_insert" on public.standing_reminders
  for insert to authenticated with check ( public.current_app_role() is not null );

drop policy if exists "standing_reminders_auth_update" on public.standing_reminders;
create policy "standing_reminders_auth_update" on public.standing_reminders
  for update to authenticated
  using ( public.current_app_role() is not null )
  with check ( public.current_app_role() is not null );


-- ========== 0019_panel_mirror.sql ==========
-- 0019_panel_mirror.sql
-- Mirror danych „tylko-localStorage" z aplikacji recepcji do chmury (snapshot jsonb per `kind`),
-- żeby panel mógł je pokazać online: schedule (grafik przydzielony), payment_corrections (korekty),
-- reports_full (raporty zmian = źródło raportu dobowego).
-- Aplikacja recepcji (klucz anon) zapisuje; panel (zalogowany) czyta.

create table if not exists public.panel_mirror (
  tenant_id  uuid not null,
  kind       text not null,                 -- schedule | payment_corrections | reports_full
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, kind)
);

alter table public.panel_mirror enable row level security;

drop policy if exists "panel_mirror_anon_write" on public.panel_mirror;
create policy "panel_mirror_anon_write" on public.panel_mirror
  for all to anon using (true) with check (true);

drop policy if exists "panel_mirror_auth_read" on public.panel_mirror;
create policy "panel_mirror_auth_read" on public.panel_mirror
  for select to authenticated using (true);


-- ========== 0020_panel_extra.sql ==========
-- 0020_panel_extra.sql
-- Admin może zmienić wyświetlany login (imię) konta, np. „Menedżer główny" → „Lukasz".

create or replace function public.admin_set_name(p_email text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  update public.app_accounts set name = trim(p_name) where email = p_email;
  perform public.log_action('konto_login', format('%s → %s', p_email, trim(p_name)), null);
end $$;
grant execute on function public.admin_set_name(text, text) to authenticated;


-- ========== 0021_panel_plan.sql ==========
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


-- ========== 0022_panel_grafik_ai.sql ==========
-- 0022_panel_grafik_ai.sql
-- Panel (zalogowany) może ZAPISYWAĆ do panel_mirror — m.in. propozycję grafiku (kind='proposed_schedule'),
-- którą aplikacja recepcji pobiera i wstawia do swojego grafiku.

drop policy if exists "panel_mirror_auth_write" on public.panel_mirror;
create policy "panel_mirror_auth_write" on public.panel_mirror
  for all to authenticated using (true) with check (true);


-- ========== 0023_panel_reviews.sql ==========
-- 0023_panel_reviews.sql
-- Recepcja widzi opinie gości (Booking) przez statystyki/raporty — odczyt dla zalogowanych.

drop policy if exists "booking_reviews_auth_read" on public.booking_reviews;
create policy "booking_reviews_auth_read" on public.booking_reviews
  for select to authenticated using (true);


-- ========== 0024_panel_grafik_hours.sql ==========
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


-- ========== 0025_panel_hk.sql ==========
-- 0025_panel_hk.sql
-- Przypomnienia kierownika HK widoczne na telefonach ekipy (drugie okno „Poproś o pokój").
-- Telefon (anon) czyta; panel (zalogowany kierownik HK) dodaje/usuwa.

create table if not exists public.hk_reminders (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  body       text not null,
  created_by text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists hk_reminders_active_idx on public.hk_reminders(tenant_id, active, created_at desc);

alter table public.hk_reminders enable row level security;

drop policy if exists "hk_reminders_anon_read" on public.hk_reminders;
create policy "hk_reminders_anon_read" on public.hk_reminders for select to anon using (true);

drop policy if exists "hk_reminders_auth_all" on public.hk_reminders;
create policy "hk_reminders_auth_all" on public.hk_reminders
  for all to authenticated using (public.current_app_role() is not null) with check (public.current_app_role() is not null);


-- ========== seed_app_accounts.sql ==========
-- seed_app_accounts.sql
-- Wstępny spis 7 kont panelu menedżerskiego. Imiona możesz dowolnie zmienić (kolumna name).
-- Email to ukryty login — nie musi istnieć fizycznie (potwierdzanie maila WYŁĄCZONE w Auth).
-- Konta są nieprzejęte (claimed=false): przy 1. logowaniu osoba ustawia swoje hasło.
-- Uruchom PO migracji 0010. Bezpieczne do ponownego puszczenia (ON CONFLICT DO NOTHING).

insert into public.app_accounts (tenant_id, name, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Admin',                'admin@conrad-panel.com',      'admin'),
  ('00000000-0000-0000-0000-000000000001', 'Koordynator',          'koordynator@conrad-panel.com','koordynator'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer recepcji',    'recepcja@conrad-panel.com',   'mgr_recepcja'),
  ('00000000-0000-0000-0000-000000000001', 'Tetiana (HK)',         'tetiana@conrad-panel.com',    'mgr_hk'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer główny',      'glowny@conrad-panel.com',     'mgr_glowny'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer operacyjny',  'operacyjny@conrad-panel.com', 'mgr_operacyjny'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer gastronomii', 'gastro@conrad-panel.com',     'mgr_gastro')
on conflict (email) do nothing;

