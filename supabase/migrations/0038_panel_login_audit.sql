-- 0038_panel_login_audit.sql
-- Podgląd aktywności logowań (tylko admin): kto wszedł i czy coś zrobił.
-- Wymaga 0013_panel_audit.sql (tabela panel_audit + log_action). Akcja logowania
-- zapisywana z panelu jako action='logowanie'.

-- Sesje logowań: dla każdego wejścia liczymy ile akcji (innych niż samo logowanie)
-- wykonała ta sama osoba do następnego swojego logowania (albo do teraz).
-- actions = 0  →  „wszedł i nic nie zrobił".
create or replace function public.admin_login_sessions(p_days int default 14)
returns table(actor text, actor_role text, login_at timestamptz, actions int, last_action_at timestamptz)
language sql stable security definer set search_path = public as $$
  with logins as (
    select actor, actor_role, created_at as login_at,
           lead(created_at) over (partition by actor order by created_at) as next_login
    from public.panel_audit
    where action = 'logowanie'
      and created_at >= now() - make_interval(days => p_days)
  )
  select l.actor, l.actor_role, l.login_at,
    (select count(*)::int from public.panel_audit a
       where a.actor = l.actor and a.action <> 'logowanie'
         and a.created_at > l.login_at
         and (l.next_login is null or a.created_at < l.next_login)) as actions,
    (select max(a.created_at) from public.panel_audit a
       where a.actor = l.actor and a.action <> 'logowanie'
         and a.created_at > l.login_at
         and (l.next_login is null or a.created_at < l.next_login)) as last_action_at
  from logins l
  where public.current_app_role() = 'admin'
  order by l.login_at desc
  limit 200;
$$;

-- Pełny dziennik akcji (tylko admin) — z dłuższym limitem niż list_panel_audit.
create or replace function public.admin_list_audit(p_days int default 14, p_limit int default 300)
returns table(actor text, actor_role text, action text, detail text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select actor, actor_role, action, detail, created_at
  from public.panel_audit
  where public.current_app_role() = 'admin'
    and created_at >= now() - make_interval(days => p_days)
  order by created_at desc
  limit p_limit;
$$;

grant execute on function public.admin_login_sessions(int)      to authenticated;
grant execute on function public.admin_list_audit(int, int)     to authenticated;
