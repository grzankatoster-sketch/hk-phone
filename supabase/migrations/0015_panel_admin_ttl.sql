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
