-- 0056_superadmin_tenants.sql  (kokpit właściciela SaaS — lista hoteli, płatności, kill-switch)
-- Do tej pory `tenants` (0049) miał write-policy otwartą dla KAŻDEJ zalogowanej
-- roli (current_app_role() is not null) — bezpieczne dopóki nikt tego nie używał,
-- ale teraz dodajemy realny kill-switch, więc zawężamy zapis do nowej roli
-- `superadmin` (operator SaaS, NIE hotel). Odczyt zostaje otwarty (potrzebny do
-- rozwiązania brandingu w runtime, 2.7).
-- Numer WhatsApp per hotel = decyzja usera (osobny numer/telefon per hotel,
-- nie jeden wspólny bot) — czysto informacyjna etykieta w tenants, bot serwisem
-- utrzymuje osobną sesję Baileys per tenant_id (patrz scripts/whatsapp-bot/bot.mjs).
-- Idempotentne.

alter table public.app_accounts drop constraint if exists app_accounts_role_check;
alter table public.app_accounts add constraint app_accounts_role_check
  check (role in ('superadmin','owner','admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro'));

alter table public.tenants add column if not exists whatsapp_number text;

-- ─── Zawężenie zapisu do tenants — tylko superadmin ───────────────────────────
drop policy if exists "tenants_auth_write" on public.tenants;
drop policy if exists "tenants_auth_upd"   on public.tenants;
create policy "tenants_auth_write" on public.tenants for insert to authenticated
  with check ( public.current_app_role() = 'superadmin' );
create policy "tenants_auth_upd"   on public.tenants for update to authenticated
  using ( public.current_app_role() = 'superadmin' ) with check ( public.current_app_role() = 'superadmin' );

-- ─── RPC: lista hoteli (nazwa, status, plan, opłacone do, numer WhatsApp) ─────
create or replace function public.superadmin_list_tenants()
returns table(id uuid, name text, slug text, status text, plan text,
              trial_ends_at timestamptz, whatsapp_number text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, name, slug, status, plan, trial_ends_at, whatsapp_number, created_at
  from public.tenants
  where public.current_app_role() = 'superadmin'
  order by created_at desc;
$$;
grant execute on function public.superadmin_list_tenants() to authenticated;

-- ─── RPC: kill-switch / zmiana statusu (trial|active|suspended) ──────────────
create or replace function public.superadmin_set_tenant_status(p_tenant_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'superadmin' then raise exception 'Tylko superadmin.'; end if;
  if p_status not in ('trial','active','suspended') then raise exception 'Zły status.'; end if;
  update public.tenants set status = p_status where id = p_tenant_id;
end $$;
grant execute on function public.superadmin_set_tenant_status(uuid, text) to authenticated;

-- ─── RPC: ustaw datę końca próby/opłacenia ────────────────────────────────────
create or replace function public.superadmin_set_tenant_trial_ends(p_tenant_id uuid, p_trial_ends_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'superadmin' then raise exception 'Tylko superadmin.'; end if;
  update public.tenants set trial_ends_at = p_trial_ends_at where id = p_tenant_id;
end $$;
grant execute on function public.superadmin_set_tenant_trial_ends(uuid, timestamptz) to authenticated;

-- ─── RPC: numer WhatsApp przypisany do hotelu (etykieta, nie sekret) ─────────
create or replace function public.superadmin_set_tenant_whatsapp(p_tenant_id uuid, p_number text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'superadmin' then raise exception 'Tylko superadmin.'; end if;
  update public.tenants set whatsapp_number = nullif(trim(p_number),'') where id = p_tenant_id;
end $$;
grant execute on function public.superadmin_set_tenant_whatsapp(uuid, text) to authenticated;

-- ─── RPC: nowy hotel (imię + slug; reszta — moduły/branding — osobno, 4.13) ──
create or replace function public.superadmin_create_tenant(p_name text, p_slug text, p_plan text default 'start')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.current_app_role() <> 'superadmin' then raise exception 'Tylko superadmin.'; end if;
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_slug),'') = '' then raise exception 'Brak nazwy/sluga.'; end if;
  insert into public.tenants(name, slug, status, plan, trial_ends_at)
    values (trim(p_name), trim(p_slug), 'trial', coalesce(nullif(trim(p_plan),''),'start'), now() + interval '7 days')
    returning id into v_id;
  return v_id;
end $$;
grant execute on function public.superadmin_create_tenant(text, text, text) to authenticated;
