-- 0070_admin_bootstrap.sql
-- WYKONANIE 0.2: hasło administratora ("bootstrap" — brama do ustawienia
-- WŁASNEGO hasła kierownika, patrz src/lib/adminAuth.js) przestaje byc
-- zaszyte w bundlu (VITE_ADMIN_PASSWORD). Zamiast porownania z plaintextem
-- w JS, klient woła RPC ktore porownuje hash po stronie Postgresa (pgcrypto)
-- i zwraca tylko true/false — haszu nikt z zewnatrz nie odczyta.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_bootstrap (
  tenant_id  uuid primary key,
  hash       text not null,
  updated_at timestamptz not null default now()
);
-- RLS wlaczone, ZERO polityk dla anon/authenticated (deny-by-default) —
-- tabela czytana/pisana wylacznie przez ponizsze funkcje SECURITY DEFINER.
alter table public.admin_bootstrap enable row level security;

create or replace function public.verify_admin_bootstrap(p_tenant_id uuid, p_candidate text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored text;
begin
  select hash into stored from public.admin_bootstrap where tenant_id = p_tenant_id;
  if stored is null or p_candidate is null or length(p_candidate) = 0 then
    return false;
  end if;
  return extensions.crypt(p_candidate, stored) = stored;
end;
$$;
grant execute on function public.verify_admin_bootstrap(uuid, text) to anon, authenticated;

-- Nadawanie/rotacja hasla — TYLKO service_role (skrypty admina lokalnie,
-- z kluczem SUPABASE_SERVICE_KEY), nigdy z klienta anon/authenticated.
create or replace function public.set_admin_bootstrap(p_tenant_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.admin_bootstrap (tenant_id, hash, updated_at)
  values (p_tenant_id, extensions.crypt(p_password, extensions.gen_salt('bf')), now())
  on conflict (tenant_id) do update set hash = excluded.hash, updated_at = now();
end;
$$;
revoke all on function public.set_admin_bootstrap(uuid, text) from public, anon, authenticated;
grant execute on function public.set_admin_bootstrap(uuid, text) to service_role;
