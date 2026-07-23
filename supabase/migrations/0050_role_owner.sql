-- 0050_role_owner.sql  (ETAP 2 — domknięcie modelu ról o `owner`)
-- WYKONANIE 2.13. Rejestr ról (app_accounts.role + funkcje admin_*) zyskuje rolę
-- `owner` (właściciel) — pod read-only panel właściciela (4.10) i wspólny model ról
-- (2.16-2.18). Pozostałe role mgr_* bez zmian. Idempotentne.

-- ── 1) Ograniczenie kolumny role: dołóż 'owner' ──────────────────────────────
alter table public.app_accounts drop constraint if exists app_accounts_role_check;
alter table public.app_accounts add constraint app_accounts_role_check
  check (role in ('owner','admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro'));

-- ── 2) admin_add_account: pozwól tworzyć konto owner (kopia 0016 + 'owner') ───
create or replace function public.admin_add_account(p_name text, p_role text, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text; v_has_code boolean;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  if p_role not in ('owner','admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
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

-- ── 3) admin_set_role: pozwól ustawić rolę owner (kopia 0015 + 'owner') ───────
create or replace function public.admin_set_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if p_role not in ('owner','admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')
    then raise exception 'Zła rola.'; end if;
  update public.app_accounts set role = p_role where email = p_email;
  perform public.log_action('konto_rola', format('%s → %s', p_email, p_role), null);
end $$;
grant execute on function public.admin_set_role(text, text) to authenticated;
