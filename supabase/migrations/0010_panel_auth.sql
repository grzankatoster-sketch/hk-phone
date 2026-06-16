-- 0010_panel_auth.sql
-- Panel menedżerski: logowanie po imieniu (spis) + pierwsze hasło (Supabase Auth),
-- role i mapa konto->rola. Osobne od tabeli `managers` (logowanie kierownika w apce React).
-- Hasła trzyma Supabase Auth (bcrypt) — tu NIE ma hasła, tylko spis + rola + powiązanie z auth.users.

-- ─── app_accounts ─────────────────────────────────────────────────────────────
create table if not exists public.app_accounts (
  user_id    uuid unique references auth.users(id) on delete set null, -- null = konto jeszcze nieprzejęte
  tenant_id  uuid not null,
  name       text not null,            -- wyświetlane imię (spis logowania)
  email      text not null unique,     -- syntetyczny, ukryty login: <slug>@conrad-panel.com
  role       text not null check (role in
               ('admin','koordynator','mgr_recepcja','mgr_hk','mgr_glowny','mgr_operacyjny','mgr_gastro')),
  claimed    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.app_accounts enable row level security;

-- Spis na ekranie logowania (imię/rola/email/claimed). Hasła tu nie ma, więc odczyt jest bezpieczny.
drop policy if exists "accounts_public_list" on public.app_accounts;
create policy "accounts_public_list" on public.app_accounts
  for select to anon, authenticated using (true);

-- ─── current_app_role() ───────────────────────────────────────────────────────
-- Rola zalogowanego użytkownika — używana przez panel po zalogowaniu oraz przez RLS
-- w kolejnych iteracjach (polityki tabel danych będą sprawdzać current_app_role()).
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.app_accounts where user_id = auth.uid()
$$;

-- ─── claim_account(email) ─────────────────────────────────────────────────────
-- Pierwsze logowanie: po utworzeniu konta Auth (signUp) wiążemy je z wierszem spisu.
-- Działa tylko gdy wiersz jest jeszcze nieprzejęty (user_id is null). Zwraca rolę.
create or replace function public.claim_account(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null then
    raise exception 'Brak zalogowania.';
  end if;
  update public.app_accounts
     set user_id = auth.uid(), claimed = true
   where email = p_email and user_id is null
   returning role into v_role;
  -- Gdy wiersz był już przejęty/email nieznany — zwróć rolę bieżącego usera (jeśli to jego konto).
  if v_role is null then
    select role into v_role from public.app_accounts where user_id = auth.uid();
  end if;
  return v_role;
end $$;

grant execute on function public.current_app_role()      to anon, authenticated;
grant execute on function public.claim_account(text)     to anon, authenticated;

-- ─── Dostęp dla zalogowanych (authenticated) do tabel czytanych przez panel ─────
-- Istniejące polityki są tylko `TO anon`, więc zalogowany użytkownik panelu (rola
-- `authenticated`) NIE widziałby tych danych. Te tabele są i tak publicznie czytelne
-- przez anon — dokładamy więc równoważny odczyt dla authenticated (bez regresu).
-- Zapis pozostaje jak był; panel na razie tylko czyta.
do $$
declare t text;
begin
  foreach t in array array[
    'hk_plan','hk_rooms','hk_logs','hk_tasks','hk_workers',
    'faults','shift_reports','hk_adhoc_tasks','schedule','hk_roster'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_auth_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_auth_read', t);
  end loop;
end $$;
