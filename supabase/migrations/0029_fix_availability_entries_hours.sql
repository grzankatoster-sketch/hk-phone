-- 0029_fix_availability_entries_hours.sql
-- FIX dryfu schematu: w realnej bazie funkcje get_availability/set_availability/get_request_grid
-- (z 0024 i 0028) odwołują się do availability_entries.start_h / end_h, ale te KOLUMNY nigdy nie
-- zostały dodane (0024 wgrane tylko częściowo — funkcje tak, ALTER TABLE nie).
--
-- Objaw: pracownik otwiera link z grafiku → get_availability rzuca
--   "column e.start_h does not exist" → supabase-js zwraca data=null →
--   grafik.html pokazuje „Link nieaktywny", mimo że token jest ważny (np. okno 24h).
--
-- To jest TYLKO uzupełnienie kolumn. NIE redefiniujemy funkcji, żeby nie cofnąć
-- zmian z 0028 (expires_at, choice 'oba'). Idempotentne — bezpieczne do ponownego uruchomienia.

alter table public.availability_entries add column if not exists start_h text;
alter table public.availability_entries add column if not exists end_h   text;
