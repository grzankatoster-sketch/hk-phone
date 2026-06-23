-- 0039_panel_notif_prefs.sql
-- PREFERENCJE POWIADOMIEŃ w panelu menedżerów (panel.html). Dotąd panel sygnalizował
-- tylko nową POCZTĘ (badge na zakładce). Pozostałe zdarzenia z mirrora recepcji
-- (korekty kasy, notatki służbowe, raporty zmian) i zadania przepływały bez żadnego
-- powiadomienia. Tu dokładamy per-konto wybór: KTO chce powiadomień O CZYM.
--
--   • przechowuje WYŁĄCZNIE preferencje (które kategorie włączone), nie stan
--     przeczytania — „nieprzeczytane" panel liczy po stronie klienta
--     (manager_messages.read_at + porównanie id snapshotów mirrora w localStorage),
--   • klucz = e-mail konta panelu (app_accounts.email), jak current_app_email(),
--   • prefs jsonb: { "poczta": true, "korekty": true, "notatki": true,
--                     "raporty": true, "zadania": true, "grafik": true },
--   • brak wiersza / brak klucza = DOMYŚLNIE WŁĄCZONE dla kategorii pasujących do
--     roli (klient ustala domyślne wg roli) — zero regresji, menedżer ODZNACZA
--     niechciane (np. kierownik recepcji: tylko korekty + notatki).
--
-- Bezpieczeństwo: RLS-only. Konto czyta/zapisuje WYŁĄCZNIE własny wiersz
-- (email = current_app_email()); admin widzi wszystkie (diagnostyka). Idempotentne.

create table if not exists public.panel_notif_prefs (
  tenant_id   uuid not null default '00000000-0000-0000-0000-000000000001',
  email       text not null,                 -- app_accounts.email (= current_app_email())
  prefs       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, email)
);

alter table public.panel_notif_prefs enable row level security;

-- Odczyt: własny wiersz lub admin.
drop policy if exists "pnp_read" on public.panel_notif_prefs;
create policy "pnp_read" on public.panel_notif_prefs
  for select to authenticated using (
        email = public.current_app_email()
     or public.current_app_role() = 'admin'
  );

-- Zapis (utworzenie): zalogowane konto panelu, wiersz = mój.
drop policy if exists "pnp_insert" on public.panel_notif_prefs;
create policy "pnp_insert" on public.panel_notif_prefs
  for insert to authenticated with check (
        public.current_app_role() is not null
    and email = public.current_app_email()
  );

-- Aktualizacja: tylko własny wiersz.
drop policy if exists "pnp_update" on public.panel_notif_prefs;
create policy "pnp_update" on public.panel_notif_prefs
  for update to authenticated using (
        email = public.current_app_email()
  ) with check (
        email = public.current_app_email()
  );
