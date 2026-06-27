-- 0035_manager_alerts_target_date.sql
-- ZADANIA przekazywane z panelu menedżera na recepcję (manager_alerts) zyskują
-- KONKRETNĄ DATĘ celu. Dotąd zadanie miało tylko `target_shift` (zmianę) i było
-- widoczne na recepcji od razu — nie dało się zaplanować zadania „na poniedziałek
-- popołudniową". Panel ma teraz kalendarz wyboru dnia/zmiany/osoby, a recepcja
-- pokazuje takie zadanie dopiero w tym dniu (App.jsx/InboxPanel/PreShiftModal
-- filtrują: !target_date || target_date === dzisiejszy klucz).
--
--   NULL          → zadanie bez daty (zachowanie jak dotąd: widoczne od razu,
--                   filtrowane tylko po zmianie).
--   'YYYY-MM-DD'  → zadanie widoczne wyłącznie w tym dniu.
--
-- Idempotentne.

alter table public.manager_alerts add column if not exists target_date date;
