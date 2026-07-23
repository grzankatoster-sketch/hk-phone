-- 0053_whatsapp_bot.sql  (WYKONANIE 4.24 — bot WhatsApp: wysyłka linku do grafiku)
-- Kolejka wysyłek + kontakty pracowników. Numer telefonu SZYFROWANY (pgcrypto),
-- NIE hashowany — hash byłby bezużyteczny, bot musi znać prawdziwy numer żeby
-- wysłać wiadomość. Klucz szyfrujący istnieje TYLKO jako ustawienie bazy danych
-- (nigdy w kliencie/repo), więc nawet wyciek kodu aplikacji (patrz incydent
-- .env w instalatorach) nie odsłania numerów.
--
-- WYMAGANY RĘCZNY KROK PO TWOJEJ STRONIE (raz, w Supabase SQL editor — NIE tutaj,
-- bo ten plik trafia do repo/gita i sekret nie może w nim być):
--   alter database postgres set app.whatsapp_key = '<długi-losowy-sekret>';
-- Wygeneruj sekret np. `openssl rand -hex 32`. Bez tego kroku set_employee_phone
-- i decrypt_employee_phones rzucą błąd (current_setting bez `true` = wyjątek,
-- celowo — nie chcemy cichego szyfrowania pustym/domyślnym kluczem).
--
-- Idempotentne.

create extension if not exists pgcrypto;

-- ─── Kontakty pracowników (numer telefonu WhatsApp, per tenant+imię) ──────────
create table if not exists public.employee_contacts (
  tenant_id  uuid not null,
  name       text not null,
  phone_enc  bytea,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, name)
);
alter table public.employee_contacts enable row level security;
-- Celowo ZERO polityk SELECT/UPDATE dla anon/authenticated (wzorzec availability_*
-- z 0012) — zapis wyłącznie przez set_employee_phone (poniżej), odczyt treści
-- (odszyfrowanie) wyłącznie przez decrypt_employee_phones ograniczone do service_role.

-- Manager wpisuje/aktualizuje numer pracownika. Nie zwraca numeru z powrotem.
create or replace function public.set_employee_phone(p_tenant_id uuid, p_name text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Brak imienia.'; end if;
  insert into public.employee_contacts(tenant_id, name, phone_enc, updated_at)
    values (p_tenant_id, trim(p_name),
            case when coalesce(trim(p_phone),'') = '' then null
                 else pgp_sym_encrypt(trim(p_phone), current_setting('app.whatsapp_key')) end,
            now())
    on conflict (tenant_id, name) do update
      set phone_enc = excluded.phone_enc, updated_at = now();
end $$;
grant execute on function public.set_employee_phone(uuid, text, text) to authenticated;

-- Manager widzi tylko CZY numer jest ustawiony (bool) — nigdy treść, nawet zaszyfrowaną.
create or replace function public.list_employee_phone_status(p_tenant_id uuid)
returns table(name text, has_phone boolean)
language sql stable security definer set search_path = public as $$
  select name, (phone_enc is not null) as has_phone
  from public.employee_contacts
  where tenant_id = p_tenant_id and public.current_app_role() is not null;
$$;
grant execute on function public.list_employee_phone_status(uuid) to authenticated;

-- Odszyfrowanie — WYŁĄCZNIE dla serwisu bota (klucz service_role, jak push-send).
-- Jawnie odbieramy domyślny grant PUBLIC, żeby nikt inny (anon/authenticated)
-- nie mógł tego wywołać, nawet gdyby ktoś zgadł nazwę funkcji.
create or replace function public.decrypt_employee_phones(p_tenant_id uuid)
returns table(name text, phone text)
language sql stable security definer set search_path = public as $$
  select name, pgp_sym_decrypt(phone_enc, current_setting('app.whatsapp_key'))
  from public.employee_contacts
  where tenant_id = p_tenant_id and phone_enc is not null;
$$;
revoke all on function public.decrypt_employee_phones(uuid) from public;
grant execute on function public.decrypt_employee_phones(uuid) to service_role;

-- ─── Kolejka wysyłek WhatsApp (jedna pozycja per pracownik przy generowaniu grafiku) ─
create table if not exists public.whatsapp_send_queue (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  person     text not null,
  token      text not null,
  expires_at timestamptz,
  status     text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error      text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists whatsapp_send_queue_pending_idx
  on public.whatsapp_send_queue(status, created_at) where status = 'pending';
alter table public.whatsapp_send_queue enable row level security;
-- Celowo ZERO polityk dla anon/authenticated (zapis przez RPC, odczyt/aktualizacja
-- kolejki wyłącznie przez bota kluczem service_role — bypass RLS, wzorzec push-send).

create or replace function public.queue_whatsapp_sends(p_tenant_id uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_row jsonb; v_n int := 0;
begin
  if public.current_app_role() is null then raise exception 'Brak uprawnień.'; end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into public.whatsapp_send_queue(tenant_id, person, token, expires_at)
      values (p_tenant_id, v_row->>'person', v_row->>'token', nullif(v_row->>'expires_at','')::timestamptz);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.queue_whatsapp_sends(uuid, jsonb) to authenticated;
