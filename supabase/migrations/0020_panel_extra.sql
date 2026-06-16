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
