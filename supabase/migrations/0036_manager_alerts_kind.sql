-- 0036_manager_alerts_kind.sql
-- ROZRÓŻNIENIE: alert/ogłoszenie vs ZADANIE. Dotąd wszystko z manager_alerts trafiało
-- na recepcji do „Informacje → Pilne" (kanał alertów). Zadania wysyłane z panelu
-- menedżera powinny trafiać do zakładki „Zadania" pracownika (sekcja „Zadania
-- przekazane tej zmianie"), a nie do Pilnych.
--
--   kind='alert' (domyślnie) → ogłoszenie/info: „Informacje → Pilne" + PreShiftModal (ack).
--   kind='task'              → zadanie z panelu: zakładka „Zadania" pracownika.
--                              Zadanie PILNE (priority='high') pokazuje się DODATKOWO
--                              jako alert w „Pilne" i wymaga potwierdzenia przed zmianą.
--
-- Odhaczenie zadania przez recepcję ustawia done/done_at/done_by (te kolumny już
-- istnieją — panel.markZadanieDone ich używa), więc panel widzi „zrobione" na żywo.
-- Idempotentne.

alter table public.manager_alerts add column if not exists kind text not null default 'alert';
