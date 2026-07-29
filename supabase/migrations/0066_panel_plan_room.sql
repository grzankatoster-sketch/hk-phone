-- 0066_panel_plan_room.sql
-- Zadania konserwacji (panel_plan) mogą teraz dotyczyć konkretnego pokoju —
-- kierownik dodaje jedno zadanie z listą pokoi (CSV), powstaje osobny wiersz
-- na pokój, każdy odhaczany niezależnie (analogicznie do hk_check_items, ale
-- bez logiki zmian AM/PM — konserwacja przypisana jest do osoby, nie „kto
-- akurat sprząta"). Kolumna nullable — stare, ogólne zadania bez pokoju
-- działają bez zmian.

alter table public.panel_plan add column if not exists room text;
create index if not exists panel_plan_room_idx on public.panel_plan(plan_id, room);
