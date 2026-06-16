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
