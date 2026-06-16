-- 0017_panel_login.sql
-- Logowanie „jak na poczcie": formularz login (imię) + hasło. Admin może USTAWIĆ/ZRESETOWAĆ
-- hasło dowolnego konta (bez Edge Function), aktualizując auth.users przez funkcję SECURITY DEFINER.

create extension if not exists pgcrypto with schema extensions;

-- Admin ustawia hasło konta (reset). Działa tylko dla kont już aktywnych w Auth.
-- Potwierdza też e-mail, więc logowanie działa nawet przy włączonym „Confirm email".
create or replace function public.admin_set_password(p_email text, p_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid;
begin
  if public.current_app_role() <> 'admin' then raise exception 'Tylko admin.'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'Hasło min. 6 znaków.'; end if;
  select id into v_uid from auth.users where email = p_email;
  if v_uid is null then return false; end if;  -- konto jeszcze nieaktywne (osoba ustawi hasło sama)
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = v_uid;
  update public.app_accounts set claimed = true where email = p_email;
  perform public.log_action('konto_haslo', p_email, null);
  return true;
end $$;
grant execute on function public.admin_set_password(text, text) to authenticated;
