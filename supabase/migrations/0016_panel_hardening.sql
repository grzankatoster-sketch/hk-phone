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
