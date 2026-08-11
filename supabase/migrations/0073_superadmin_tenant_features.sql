-- 0073_superadmin_tenant_features.sql  (moduły per hotel — checkbox grid w kokpicie operatora)
-- Domyka 4.13 (komentarz w 0056_superadmin_tenants.sql): kokpit operatora mógł
-- dotąd zarządzać tylko statusem/datą/WhatsAppem hotelu, nie tym które
-- licencjonowalne moduły (tenant_features, 0049) ma włączone. Te dwie RPC idą
-- pod tym samym wzorcem co reszta superadmin_* (0056): security definer +
-- guard current_app_role() = 'superadmin'.
-- Idempotentne. Wdrożenie: wklej do panel_install.sql w Supabase SQL editor
-- (NIE `supabase db push` — patrz konwencja projektu).

-- ─── RPC: lista modułów hotelu (feature_key, enabled) ─────────────────────────
create or replace function public.superadmin_list_tenant_features(p_tenant_id uuid)
returns table(feature_key text, enabled boolean)
language sql stable security definer set search_path = public as $$
  select feature_key, enabled
  from public.tenant_features
  where tenant_id = p_tenant_id
    and public.current_app_role() = 'superadmin';
$$;
grant execute on function public.superadmin_list_tenant_features(uuid) to authenticated;

-- ─── RPC: włącz/wyłącz jeden moduł hotelu ─────────────────────────────────────
create or replace function public.superadmin_set_tenant_feature(p_tenant_id uuid, p_feature_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'superadmin' then raise exception 'Tylko superadmin.'; end if;
  if coalesce(trim(p_feature_key),'') = '' then raise exception 'Brak klucza modułu.'; end if;
  insert into public.tenant_features (tenant_id, feature_key, enabled, updated_at)
    values (p_tenant_id, trim(p_feature_key), p_enabled, now())
  on conflict (tenant_id, feature_key)
    do update set enabled = excluded.enabled, updated_at = now();
end $$;
grant execute on function public.superadmin_set_tenant_feature(uuid, text, boolean) to authenticated;
