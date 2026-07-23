-- 0057_schedules_rls.sql
-- `public.schedules` (0033_grafik_schedule.sql) powstała bez RLS — złapane przez
-- linter Supabase przy wklejaniu panel_install.sql: "Clients using anon or
-- authenticated keys may be able to access public.schedules". Cały kod appki
-- czyta/pisze ten grafik WYŁĄCZNIE przez get_schedule/save_schedule (SECURITY
-- DEFINER) — brak jakiegokolwiek bezpośredniego `.from("schedules")` w src/panel.
-- Włączenie RLS bez żadnej polityki (jak availability_requests/whatsapp_send_queue)
-- jest więc bezpieczne i niczego nie zrywa. Idempotentne.

alter table public.schedules enable row level security;
