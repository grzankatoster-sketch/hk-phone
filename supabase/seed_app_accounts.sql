-- seed_app_accounts.sql
-- Wstępny spis 7 kont panelu menedżerskiego. Imiona możesz dowolnie zmienić (kolumna name).
-- Email to ukryty login — nie musi istnieć fizycznie (potwierdzanie maila WYŁĄCZONE w Auth).
-- Konta są nieprzejęte (claimed=false): przy 1. logowaniu osoba ustawia swoje hasło.
-- Uruchom PO migracji 0010. Bezpieczne do ponownego puszczenia (ON CONFLICT DO NOTHING).

-- 'GM' (Główny Menedżer) — konto startowe do budowania struktury (działy + kierownicy,
-- zakładka Konta, 0069_panel_struktura.sql). Pierwsze logowanie: login "GM", dowolne hasło
-- min. 6 znaków (np. umówione "1qwerty") — to wpisane hasło STAJE SIĘ hasłem konta (istniejący
-- mechanizm claim_account), więc nie ma tu nic do "zresetowania" — GM po prostu wpisuje własne
-- docelowe hasło od razu przy 1. logowaniu.
insert into public.app_accounts (tenant_id, name, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'GM',                   'gm@conrad-panel.com',         'admin'),
  ('00000000-0000-0000-0000-000000000001', 'Admin',                'admin@conrad-panel.com',      'admin'),
  ('00000000-0000-0000-0000-000000000001', 'Koordynator',          'koordynator@conrad-panel.com','koordynator'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer recepcji',    'recepcja@conrad-panel.com',   'mgr_recepcja'),
  ('00000000-0000-0000-0000-000000000001', 'Tetiana (HK)',         'tetiana@conrad-panel.com',    'mgr_hk'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer główny',      'glowny@conrad-panel.com',     'mgr_glowny'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer operacyjny',  'operacyjny@conrad-panel.com', 'mgr_operacyjny'),
  ('00000000-0000-0000-0000-000000000001', 'Menedżer gastronomii', 'gastro@conrad-panel.com',     'mgr_gastro')
on conflict (email) do nothing;
