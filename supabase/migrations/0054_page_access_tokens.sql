-- 0054_page_access_tokens.sql
-- Bramka dostępu do stron telefonu bez logowania, otwieranych przez zapisany
-- link (wyjazdy.html) — dotąd bez żadnego tokena: każdy, kto poznał adres URL,
-- widział realne dane wyjazdów gości. Ten sam wzorzec bezpieczeństwa co
-- availability_tokens (migracja 0012): RLS włączony, ZERO polityk → dostęp
-- wyłącznie przez funkcję SECURITY DEFINER poniżej.

create table if not exists public.page_access_tokens (
  token      text primary key,
  tenant_id  uuid not null,
  page       text not null,        -- np. 'wyjazdy' — rozszerzalne na kolejne bez-loginowe strony
  label      text,                 -- kto/co dostał link, np. "Menedżer HK"
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.page_access_tokens enable row level security;
-- celowo BRAK polityk — dostęp tylko przez funkcję poniżej (jak availability_tokens).

create or replace function public.check_page_token(p_token text, p_page text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.page_access_tokens
    where token = p_token and page = p_page and active
  );
$$;
grant execute on function public.check_page_token(text, text) to anon, authenticated;

-- Token startowy dla istniejącego zapisanego linku „Wyjazdy" (menedżer HK) —
-- stary link bez ?t= przestaje działać, ten nowy trzeba zapisać w jego miejsce.
insert into public.page_access_tokens (token, tenant_id, page, label)
values ('C59313', '00000000-0000-0000-0000-000000000001', 'wyjazdy', 'Menedżer HK')
on conflict (token) do nothing;
