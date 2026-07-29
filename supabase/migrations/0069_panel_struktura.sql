-- 0069_panel_struktura.sql
-- Struktura hotelu w panelu: GM sam buduje działy (Recepcja/Sprzątanie/Gastronomia...) i
-- dodaje do nich kierowników; funkcje/zakładki widoczne danej osobie może zawęzić/rozszerzyć
-- (domyślnie dobierane przez AI po stanowisku — patrz Edge Function `llm`, task "roletabs").
-- app_accounts.tabs = null → zachowanie jak dotąd (tabsFor(role) hardkodowany, zero regresji
-- dla istniejących 7 kont). app_accounts.tabs = tablica → JAWNA lista zakładek nadpisuje rolę.
-- Idempotentne.

-- ─── panel_departments ─────────────────────────────────────────────────────────
create table if not exists public.panel_departments (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  name       text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);
alter table public.panel_departments enable row level security;

drop policy if exists "departments_public_list" on public.panel_departments;
create policy "departments_public_list" on public.panel_departments
  for select to anon, authenticated using (true);

-- ─── app_accounts: dział + jawna lista funkcji ─────────────────────────────────
alter table public.app_accounts add column if not exists department_id uuid
  references public.panel_departments(id) on delete set null;
alter table public.app_accounts add column if not exists tabs text[];

-- ─── Katalog dozwolonych kluczy zakładek (obrona w głąb — niezależna od panel.html/LLM) ─
create or replace function public.panel_valid_tab_keys()
returns text[] language sql immutable as $$
  select array[
    'poczta','pulpit','live','wyjazdy','staty','praca','jakosc','kontrole','tablica',
    'znalezione','grafik','zmiany','zadania','kasa','konserw','sla','plan','akcje',
    'konta','logi'
  ]
$$;

-- ─── RPC: działy (admin) ────────────────────────────────────────────────────────
create or replace function public.admin_list_departments()
returns table(id uuid, name text)
language sql stable security definer set search_path = public as $$
  select id, name from public.panel_departments
  where public.current_app_role() = 'admin'
  order by name;
$$;
grant execute on function public.admin_list_departments() to authenticated;

create or replace function public.admin_add_department(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak nazwy działu.'; end if;
  insert into public.panel_departments(name) values (trim(p_name))
    on conflict (tenant_id, name) do update set name = excluded.name
    returning id into v_id;
  perform public.log_action('dzial_dodany', trim(p_name), null);
  return v_id;
end $$;
grant execute on function public.admin_add_department(text) to authenticated;

create or replace function public.admin_delete_department(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_in_use int;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  select count(*) into v_in_use from public.app_accounts where department_id = p_id;
  if v_in_use > 0 then raise exception 'Dział ma przypisane konta — najpierw je przenieś.'; end if;
  delete from public.panel_departments where id = p_id returning name into v_name;
  if v_name is not null then perform public.log_action('dzial_usuniety', v_name, null); end if;
end $$;
grant execute on function public.admin_delete_department(uuid) to authenticated;

-- ─── admin_add_account: rozszerzony o dział + jawną listę funkcji (kompatybilne wstecz) ─
-- Postgres nie "replace'uje" funkcji przy zmianie liczby parametrów (to byłby nowy overload,
-- dwuznaczny wobec starych wywołań) — usuwamy WSZYSTKIE starsze sygnatury i tworzymy jedną,
-- z DEFAULT NULL na nowych parametrach (stare wywołania z 2 lub 3 argumentami działają dalej).
-- Bez dropu 2-argumentowej wersji (0015_panel_admin_ttl.sql) wywołanie z samymi p_name+p_role
-- byłoby dwuznaczne między nią a tą funkcją (identyczne typy) → Postgres zwróciłby błąd
-- "function admin_add_account(...) is not unique".
drop function if exists public.admin_add_account(text, text);
drop function if exists public.admin_add_account(text, text, text);
create or replace function public.admin_add_account(
  p_name text, p_role text, p_code text default '',
  p_department_id uuid default null, p_tabs text[] default null
)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text; v_has_code boolean; v_tabs text[];
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  if p_role not in ('superadmin','owner','admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
    then raise exception 'Zła rola.'; end if;
  if p_tabs is not null then
    select array_agg(t) into v_tabs from unnest(p_tabs) t where t = any(public.panel_valid_tab_keys());
  end if;
  v_has_code := coalesce(trim(p_code),'') <> '';
  v_email := 'acc_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10) || '@conrad-panel.com';
  insert into public.app_accounts(tenant_id, name, email, role, requires_code, claim_code_hash, department_id, tabs)
    values ('00000000-0000-0000-0000-000000000001', trim(p_name), v_email, p_role,
            v_has_code, case when v_has_code then md5(trim(p_code)) else null end,
            p_department_id, v_tabs);
  perform public.log_action('konto_dodane',
    format('%s (%s)%s', trim(p_name), p_role, case when v_has_code then ' + kod' else '' end), null);
  return v_email;
end $$;
grant execute on function public.admin_add_account(text, text, text, uuid, text[]) to authenticated;

-- ─── RPC: dział / funkcje istniejącego konta ───────────────────────────────────
create or replace function public.admin_set_department(p_email text, p_department_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  update public.app_accounts set department_id = p_department_id where email = p_email;
  perform public.log_action('konto_dzial', p_email, null);
end $$;
grant execute on function public.admin_set_department(text, uuid) to authenticated;

create or replace function public.admin_set_tabs(p_email text, p_tabs text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_tabs text[];
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if p_tabs is null or array_length(p_tabs, 1) is null then
    update public.app_accounts set tabs = null where email = p_email;
  else
    select array_agg(t) into v_tabs from unnest(p_tabs) t where t = any(public.panel_valid_tab_keys());
    update public.app_accounts set tabs = v_tabs where email = p_email;
  end if;
  perform public.log_action('konto_funkcje', p_email, null);
end $$;
grant execute on function public.admin_set_tabs(text, text[]) to authenticated;

-- ─── admin_list_accounts: dołóż dział + funkcje ────────────────────────────────
-- DROP wymagany: Postgres nie pozwala CREATE OR REPLACE zmienić kolumn wyjściowych
-- (OUT params) już istniejącej funkcji tabelarycznej — błąd 42P13.
drop function if exists public.admin_list_accounts();
create or replace function public.admin_list_accounts()
returns table(name text, email text, role text, claimed boolean, active boolean,
              created_at timestamptz, department_id uuid, department_name text, tabs text[])
language sql stable security definer set search_path = public as $$
  select a.name, a.email, a.role, a.claimed, a.active, a.created_at,
         a.department_id, d.name as department_name, a.tabs
  from public.app_accounts a
  left join public.panel_departments d on d.id = a.department_id
  where public.current_app_role() = 'admin'
  order by a.created_at;
$$;
grant execute on function public.admin_list_accounts() to authenticated;
