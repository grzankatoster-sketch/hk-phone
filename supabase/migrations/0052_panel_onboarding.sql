-- 0052_panel_onboarding.sql  (WYKONANIE 4.25 — onboarding pracownika)
-- Tura pierwszego logowania: flaga onboarded_at PER KONTO (nie localStorage —
-- pracownik loguje się z różnych telefonów, flaga musi iść z kontem, nie z urządzeniem).
-- Idempotentne.

alter table public.app_accounts add column if not exists onboarded_at timestamptz;

-- Woła to zalogowane konto samo o sobie, po zamknięciu/pominięciu tury —
-- zwykły authenticated wystarczy (analogicznie do innych *_set_* na własne konto).
create or replace function public.mark_onboarded()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.app_accounts
     set onboarded_at = now()
   where email = public.current_app_email()
     and onboarded_at is null;
end $$;
grant execute on function public.mark_onboarded() to authenticated;
